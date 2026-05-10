import { Router } from "express";
import { createHash } from "node:crypto";
import { BackboardClient, type ChatMessagesResponse } from "backboard-sdk";
import { SendChatMessageBody } from "@workspace/api-zod";
import { getAssistantsCollection } from "../lib/mongo";
import { getHistoryCollection } from "../lib/mongo";
import { logger } from "../lib/logger";

const router = Router();

// Per-device serialization to avoid split-brain assistant/thread creation
// when concurrent chat requests race for the same device.
const deviceLocks = new Map<string, Promise<unknown>>();
function withDeviceLock<T>(deviceId: string, fn: () => Promise<T>): Promise<T> {
  const prev = deviceLocks.get(deviceId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  deviceLocks.set(
    deviceId,
    next.finally(() => {
      if (deviceLocks.get(deviceId) === next) deviceLocks.delete(deviceId);
    }),
  );
  return next;
}

function getDeviceId(req: import("express").Request): string | null {
  const header = req.header("x-device-id");
  if (header && typeof header === "string" && header.length > 0 && header.length < 200) {
    return header;
  }
  return null;
}

function buildSystemPrompt(args: {
  restrictions: string[];
  preferences: string[];
  preferenceNotes: string | null | undefined;
  nativeLanguage: string | null | undefined;
  recentDishes: string[];
}): string {
  const { restrictions, preferences, preferenceNotes, nativeLanguage, recentDishes } = args;
  const restrictionList = restrictions.length > 0 ? restrictions.join(", ") : "None declared";
  const preferenceList = preferences.length > 0 ? preferences.join(", ") : "None declared";
  const notes = (preferenceNotes ?? "").trim();
  const recent = recentDishes.length > 0 ? recentDishes.slice(0, 25).join(", ") : "No prior orders";

  return `You are the persistent travel-dining assistant for a single user with allergies and dietary needs. You have ongoing memory of this user's profile, prior conversations, and prior meals.

USER PROFILE
- Allergies / dietary restrictions (CRITICAL — safety): ${restrictionList}
- Taste preferences: ${preferenceList}
- Preference notes: ${notes || "None"}
- Native language: ${nativeLanguage || "Unknown"}

RECENT DISHES THE USER HAS ORDERED OR REVIEWED: ${recent}

YOUR JOB
1. Help refine ordering phrases for accuracy, politeness, and safety in the local language.
2. Warn about cross-contamination risks (shared fryers, woks, knives, surfaces).
3. Add appropriate allergy disclaimers to spoken/written orders.
4. Remember anything new the user tells you about themselves (new allergies, severities, preferences, restaurants visited, reactions experienced) and use it in future turns.
5. Always prioritize the user's safety. If a dish or phrasing might expose them to a restricted ingredient, flag it explicitly.
6. Keep replies concise and practical — the user is usually at a restaurant table.`;
}

function profileHashOf(args: {
  restrictions: string[];
  preferences: string[];
  preferenceNotes: string | null | undefined;
  nativeLanguage: string | null | undefined;
}): string {
  const normalized = JSON.stringify({
    r: [...args.restrictions].sort(),
    p: [...args.preferences].sort(),
    n: (args.preferenceNotes ?? "").trim(),
    l: (args.nativeLanguage ?? "").trim(),
  });
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

async function loadRecentDishes(deviceId: string): Promise<string[]> {
  try {
    const col = await getHistoryCollection();
    const docs = await col
      .find({ deviceId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .toArray();
    const names: string[] = [];
    for (const d of docs) {
      for (const item of d.items as Array<{ name?: string }>) {
        if (item && typeof item.name === "string") names.push(item.name);
        if (names.length >= 25) break;
      }
      if (names.length >= 25) break;
    }
    return names;
  } catch (err) {
    logger.warn({ msg: "loadRecentDishes failed", err: String(err) });
    return [];
  }
}

router.post("/chat/message", async (req, res) => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const deviceId = getDeviceId(req);
  if (!deviceId) {
    res.status(400).json({ error: "Missing x-device-id header" });
    return;
  }

  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "Backboard API key not configured. Please add BACKBOARD_API_KEY to your secrets.",
    });
    return;
  }

  const {
    message,
    restrictions,
    cartItems,
    orderingPhrases,
    preferences = [],
    preferenceNotes = null,
    nativeLanguage = null,
    menuLanguage = null,
  } = parsed.data;

  const recentDishes = await loadRecentDishes(deviceId);
  const systemPrompt = buildSystemPrompt({
    restrictions,
    preferences,
    preferenceNotes,
    nativeLanguage,
    recentDishes,
  });
  const hash = profileHashOf({ restrictions, preferences, preferenceNotes, nativeLanguage });

  const cartList = cartItems.length > 0 ? cartItems.join(", ") : "No items selected yet";
  const phrasesContext =
    orderingPhrases.length > 0
      ? `Current ordering phrases:\n${orderingPhrases.join("\n")}`
      : "No ordering phrases generated yet";
  const turnContext = `[Turn context]
Cart right now: ${cartList}
Menu language: ${menuLanguage || "Unknown"}
${phrasesContext}

[User message]
${message}`;

  try {
    const result = await withDeviceLock(deviceId, async () => {
      const client = new BackboardClient({ apiKey });
      const col = await getAssistantsCollection();
      const existing = await col.findOne({ deviceId });

      let assistantId: string;
      // Server-authoritative thread: ignore any client-provided threadId so a
      // stale or injected value cannot override the device's canonical thread.
      let activeThreadId: string | null = existing?.threadId ?? null;

      if (existing) {
        assistantId = existing.assistantId;
        if (existing.profileHash !== hash) {
          try {
            await client.updateAssistant(assistantId, {
              system_prompt: systemPrompt,
            });
            logger.info({
              msg: "Backboard assistant system prompt updated",
              deviceId,
              assistantId,
            });
          } catch (err) {
            logger.warn({
              msg: "Backboard updateAssistant failed; recreating",
              deviceId,
              err: String(err),
            });
            const recreated = await client.createAssistant({
              name: "Allergy Travel Assistant",
              system_prompt: systemPrompt,
            });
            assistantId = recreated.assistantId;
            activeThreadId = null;
          }
        }
      } else {
        const created = await client.createAssistant({
          name: "Allergy Travel Assistant",
          system_prompt: systemPrompt,
        });
        assistantId = created.assistantId;
        activeThreadId = null;
      }

      if (!activeThreadId) {
        const thread = await client.createThread(assistantId);
        activeThreadId = thread.threadId;
      }

      const rawResponse = await client.addMessage(activeThreadId!, {
        content: turnContext,
        stream: false,
        memory: "Auto",
      });

      const response = rawResponse as ChatMessagesResponse;
      const reply = response.content ?? "";

      const now = new Date();
      await col.updateOne(
        { deviceId },
        {
          $set: {
            deviceId,
            assistantId,
            threadId: activeThreadId,
            profileHash: hash,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );

      return { reply, threadId: activeThreadId! };
    });

    res.json(result);
  } catch (err) {
    logger.error({ msg: "Backboard chat error", err: String(err) });
    res.status(500).json({ error: "Failed to send chat message" });
  }
});

export default router;
