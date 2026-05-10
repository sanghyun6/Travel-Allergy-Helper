import { Router } from "express";
import { SendChatMessageBody } from "@workspace/api-zod";

const router = Router();

interface BackboardMessage {
  role: "user" | "assistant";
  content: string;
}

interface BackboardThread {
  thread_id: string;
  messages?: BackboardMessage[];
}

interface BackboardResponse {
  content: string;
  thread_id: string;
}

async function getOrCreateAssistant(
  apiKey: string,
  systemPrompt: string
): Promise<string> {
  const response = await fetch("https://app.backboard.io/api/assistants", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Allergy Travel Assistant",
      system_prompt: systemPrompt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Backboard assistant: ${response.status}`);
  }

  const data = (await response.json()) as { assistant_id: string };
  return data.assistant_id;
}

async function createThread(
  apiKey: string,
  assistantId: string
): Promise<string> {
  const response = await fetch("https://app.backboard.io/api/threads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assistant_id: assistantId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Backboard thread: ${response.status}`);
  }

  const data = (await response.json()) as BackboardThread;
  return data.thread_id;
}

async function sendMessage(
  apiKey: string,
  threadId: string,
  content: string
): Promise<string> {
  const response = await fetch(
    `https://app.backboard.io/api/threads/${threadId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        memory: "Auto",
        stream: false,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to send Backboard message: ${response.status}`);
  }

  const data = (await response.json()) as BackboardResponse;
  return data.content;
}

router.post("/chat/message", async (req, res) => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { message, threadId, restrictions, cartItems, orderingPhrases } =
    parsed.data;

  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error:
        "Backboard API key not configured. Please add BACKBOARD_API_KEY to your secrets.",
    });
    return;
  }

  const restrictionList =
    restrictions.length > 0 ? restrictions.join(", ") : "None";

  const cartList =
    cartItems.length > 0 ? cartItems.join(", ") : "No items selected yet";

  const phrasesContext =
    orderingPhrases.length > 0
      ? `Current ordering phrases:\n${orderingPhrases.join("\n")}`
      : "No ordering phrases generated yet";

  const systemPrompt = `You are a helpful food ordering assistant for a traveler with dietary restrictions.

IMPORTANT USER DIETARY RESTRICTIONS: ${restrictionList}
These restrictions are critical for the user's health and safety. Always keep them in mind.

Current cart items: ${cartList}

${phrasesContext}

Your role is to:
1. Help the user refine their ordering phrases for accuracy and politeness
2. Suggest how to communicate dietary needs in the local language
3. Warn about potential cross-contamination concerns
4. Help them add allergy disclaimers to their orders
5. Provide alternative phrasing if requested

Always prioritize food safety. If something might contain the user's restricted ingredients, clearly warn them.
Keep responses concise and practical — the user is at a restaurant.`;

  try {
    let activeThreadId = threadId ?? null;

    if (!activeThreadId) {
      const assistantId = await getOrCreateAssistant(apiKey, systemPrompt);
      activeThreadId = await createThread(apiKey, assistantId);
    }

    const reply = await sendMessage(apiKey, activeThreadId, message);

    res.json({
      reply,
      threadId: activeThreadId,
    });
  } catch (err) {
    console.error("Backboard chat error:", err);

    res.status(500).json({ error: "Failed to send chat message" });
  }
});

export default router;
