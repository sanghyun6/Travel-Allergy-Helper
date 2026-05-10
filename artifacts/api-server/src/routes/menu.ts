import { Router } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import {
  AnalyzeMenuBody,
  GetOrderingInstructionsBody,
} from "@workspace/api-zod";

const router = Router();

router.post("/menu/analyze", async (req, res) => {
  const parsed = AnalyzeMenuBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { imageBase64, menuLanguage, restrictions } = parsed.data;

  const restrictionList =
    restrictions.length > 0
      ? restrictions.join(", ")
      : "None specified";

  const prompt = `You are a food safety assistant for travelers with dietary restrictions.

Analyze this menu image (written in ${menuLanguage}) and identify all menu items.

The user has the following dietary restrictions: ${restrictionList}

For each menu item found, return a JSON array with this structure:
{
  "items": [
    {
      "name": "original menu item name",
      "translatedName": "English translation",
      "description": "brief description of what it is",
      "safetyLevel": "safe" | "warning" | "danger",
      "conflictingRestrictions": ["restriction1", "restriction2"],
      "allergenFlags": [
        { "name": "Peanuts", "severity": "high" | "medium" | "low" }
      ]
    }
  ],
  "detectedLanguage": "detected language name"
}

Safety levels:
- "danger": directly conflicts with user restrictions or contains major allergens (peanuts, tree nuts, shellfish, eggs, dairy, gluten, soy)
- "warning": may contain traces or unclear ingredients
- "safe": appears safe for this user

Always flag common allergens even if user didn't list them: peanuts, tree nuts, shellfish, milk/dairy, eggs, wheat/gluten, soy, fish.

Return ONLY valid JSON, no markdown.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    });

    const text = response.text ?? "{}";
    const result = JSON.parse(text);
    res.json(result);
  } catch (err) {
    console.error("Menu analysis error:", err);
    res.status(500).json({ error: "Failed to analyze menu" });
  }
});

router.post("/menu/ordering-instructions", async (req, res) => {
  const parsed = GetOrderingInstructionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { items, targetLanguage, restrictions, menuLanguage } = parsed.data;

  const restrictionList =
    restrictions.length > 0
      ? restrictions.join(", ")
      : "None";

  const prompt = `You are a food safety assistant helping a traveler order food safely.

The menu is in ${menuLanguage}. The user wants to order these items:
${items.map((item, i) => `${i + 1}. ${item}`).join("\n")}

The user's dietary restrictions: ${restrictionList}
The user's native language: ${targetLanguage}

Generate ordering instructions in ${targetLanguage} for each item. For each item:
1. Write a natural phrase to say when ordering that item in ${menuLanguage} (the restaurant's language)
2. Write phonetic pronunciation guide for that phrase
3. Include a polite allergy disclaimer in ${menuLanguage} if the user has restrictions

Also generate one combined phrase to order everything at once.

Return as JSON:
{
  "instructions": [
    {
      "item": "item name",
      "phrase": "phrase to say in the restaurant's language",
      "pronunciation": "phonetic guide"
    }
  ],
  "fullOrderPhrase": "combined phrase for the whole order"
}

Return ONLY valid JSON, no markdown.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    });

    const text = response.text ?? "{}";
    const result = JSON.parse(text);
    res.json(result);
  } catch (err) {
    console.error("Ordering instructions error:", err);
    res.status(500).json({ error: "Failed to generate ordering instructions" });
  }
});

export default router;
