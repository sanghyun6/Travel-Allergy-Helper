import { Router } from "express";
import { db, conversations as conversationsTable, messages as messagesTable } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq } from "drizzle-orm";
import {
  CreateGeminiConversationBody,
  GetGeminiConversationParams,
  DeleteGeminiConversationParams,
  ListGeminiMessagesParams,
  SendGeminiMessageParams,
  SendGeminiMessageBody,
  GenerateGeminiImageBody,
} from "@workspace/api-zod";
import { generateImage } from "@workspace/integrations-gemini-ai/image";

const router = Router();

router.get("/gemini/conversations", async (_req, res) => {
  const conversations = await db
    .select()
    .from(conversationsTable)
    .orderBy(conversationsTable.createdAt);
  res.json(conversations);
});

router.post("/gemini/conversations", async (req, res) => {
  const parsed = CreateGeminiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const [conversation] = await db
    .insert(conversationsTable)
    .values({ title: parsed.data.title })
    .returning();
  res.status(201).json(conversation);
});

router.get("/gemini/conversations/:id", async (req, res) => {
  const params = GetGeminiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const conversation = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id))
    .limit(1);
  if (!conversation[0]) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);
  res.json({ ...conversation[0], messages });
});

router.delete("/gemini/conversations/:id", async (req, res) => {
  const params = DeleteGeminiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const existing = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id))
    .limit(1);
  if (!existing[0]) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  await db
    .delete(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id));
  await db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));
  res.status(204).send();
});

router.get("/gemini/conversations/:id/messages", async (req, res) => {
  const params = ListGeminiMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);
  res.json(messages);
});

router.post("/gemini/conversations/:id/messages", async (req, res) => {
  const params = SendGeminiMessageParams.safeParse(req.params);
  const body = SendGeminiMessageBody.safeParse(req.body);

  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const conversation = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id))
    .limit(1);

  if (!conversation[0]) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await db.insert(messagesTable).values({
    conversationId: params.data.id,
    role: "user",
    content: body.data.content,
  });

  const chatMessages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  const stream = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: chatMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : ("user" as "model" | "user"),
      parts: [{ text: m.content }],
    })),
    config: { maxOutputTokens: 8192 },
  });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) {
      fullResponse += text;
      res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
    }
  }

  await db.insert(messagesTable).values({
    conversationId: params.data.id,
    role: "assistant",
    content: fullResponse,
  });

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

router.post("/gemini/generate-image", async (req, res) => {
  const parsed = GenerateGeminiImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const { b64_json, mimeType } = await generateImage(parsed.data.prompt);
    res.json({ b64_json, mimeType });
  } catch (err) {
    console.error("Image generation error:", err);
    res.status(500).json({ error: "Failed to generate image" });
  }
});

export default router;
