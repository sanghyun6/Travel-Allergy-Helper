import { Router } from "express";
import { BackboardClient, type ChatMessagesResponse } from "backboard-sdk";
import { SendChatMessageBody } from "@workspace/api-zod";

const router = Router();

router.post("/chat/message", async (req, res) => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { message, threadId, restrictions, cartItems, orderingPhrases } = parsed.data;

  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "Backboard API key not configured. Please add BACKBOARD_API_KEY to your secrets.",
    });
    return;
  }

  const restrictionList = restrictions.length > 0 ? restrictions.join(", ") : "None";
  const cartList = cartItems.length > 0 ? cartItems.join(", ") : "No items selected yet";
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
    const client = new BackboardClient({ apiKey });

    let activeThreadId: string;

    if (threadId) {
      activeThreadId = threadId;
    } else {
      const assistant = await client.createAssistant({
        name: "Allergy Travel Assistant",
        system_prompt: systemPrompt,
      });
      const thread = await client.createThread(assistant.assistantId);
      activeThreadId = thread.threadId;
    }

    const rawResponse = await client.addMessage(activeThreadId, {
      content: message,
      stream: false,
    });

    const response = rawResponse as ChatMessagesResponse;
    const reply = response.content ?? "";

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
