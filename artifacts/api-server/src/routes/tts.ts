import { Router } from "express";
import { TextToSpeechBody } from "@workspace/api-zod";

const router = Router();

const LANGUAGE_VOICE_MAP: Record<string, string> = {
  Japanese: "pNInz6obpgDQGcFmaJgB",
  Spanish: "EXAVITQu4vr4xnSDxMaL",
  French: "MF3mGyEYCl7XYWbV9V6O",
  German: "AZnzlk1XvdvUeBnXmlld",
  Italian: "XB0fDUnXU5powFXDhCwa",
  Portuguese: "N2lVS1w4EtoT3dr4eOWO",
  Chinese: "onwK4e9ZLuTAKqWW03F9",
  Korean: "g5CIjZEefAph4nQFvHAz",
  Arabic: "D38z5RcWu1voky8WS1ja",
  Russian: "zrHiDhphv9ZnVXBqCLjz",
  Hindi: "pFZP5JQG7iQjIQuC4Bku",
  Thai: "nPczCjzI2devNBz1zQrb",
  Vietnamese: "N2lVS1w4EtoT3dr4eOWO",
  Default: "21m00Tcm4TlvDq8ikWAM",
};

function getVoiceForLanguage(language: string): string {
  for (const [lang, voiceId] of Object.entries(LANGUAGE_VOICE_MAP)) {
    if (language.toLowerCase().includes(lang.toLowerCase())) {
      return voiceId;
    }
  }
  return LANGUAGE_VOICE_MAP.Default;
}

router.post("/tts/speak", async (req, res) => {
  const parsed = TextToSpeechBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { text, language } = parsed.data;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res
      .status(503)
      .json({ error: "ElevenLabs API key not configured. Please add ELEVENLABS_API_KEY to your secrets." });
    return;
  }

  const voiceId = getVoiceForLanguage(language);

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
          },
        }),
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("ElevenLabs error:", upstream.status, errText);
      res.status(502).json({ error: "ElevenLabs TTS request failed" });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");

    if (!upstream.body) {
      res.status(502).json({ error: "No audio body returned" });
      return;
    }

    const reader = upstream.body.getReader();
    const writeChunk = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
      return writeChunk();
    };

    await writeChunk();
  } catch (err) {
    console.error("TTS error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate speech" });
    }
  }
});

export default router;
