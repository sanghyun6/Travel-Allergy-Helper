import { Router } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import {
  AnalyzeMenuBody,
  GetOrderingInstructionsBody,
} from "@workspace/api-zod";
import {
  buildCitationChains,
  type CitationChain,
} from "../lib/ingredient-graph";

const router = Router();

type BBox = { ymin: number; xmin: number; ymax: number; xmax: number };

type LayoutItem = {
  id: number;
  name: string;
  boundingBox?: BBox;
  nameBox?: BBox;
};

type AllergenFlag = { name: string; severity: string };

type AnalyzedItem = {
  name: string;
  translatedName: string;
  description: string;
  safetyLevel: "safe" | "warning" | "danger";
  conflictingRestrictions: string[];
  allergenFlags: AllergenFlag[];
  boundingBox?: BBox;
  nameBox?: BBox;
  citations?: CitationChain[];
};

// Map of common restriction phrases to allergen slugs in the knowledge graph.
function restrictionsToAllergenSlugs(restrictions: string[]): string[] {
  const out = new Set<string>();
  for (const r of restrictions) {
    const s = r.toLowerCase();
    if (/peanut/.test(s)) out.add("peanut");
    if (/(tree.?nut|almond|cashew|hazelnut|walnut|pecan|pistachio|nut allerg)/.test(s)) out.add("tree-nut");
    if (/(milk|dairy|lactose|cheese)/.test(s)) out.add("milk");
    if (/egg/.test(s)) out.add("egg");
    if (/(wheat|gluten)/.test(s)) out.add("wheat");
    if (/soy/.test(s)) out.add("soy");
    if (/(fish|pescatarian)/.test(s) && !/shellfish/.test(s)) out.add("fish");
    if (/(shellfish|shrimp|prawn|crab|lobster|oyster|clam|mussel|scallop|squid|calamari)/.test(s)) out.add("shellfish");
    if (/sesame/.test(s)) out.add("sesame");
    if (/mustard/.test(s)) out.add("mustard");
    if (/sulphite|sulfite/.test(s)) out.add("sulphite");
    if (/celery/.test(s)) out.add("celery");
  }
  // If nothing matched, also flag major allergens by default so we still
  // annotate dishes with helpful citation chains even when the user has no
  // listed restriction (matches the existing "always flag common allergens"
  // behavior of the per-item prompt).
  if (out.size === 0) {
    ["peanut", "tree-nut", "milk", "egg", "wheat", "soy", "fish", "shellfish"].forEach(
      (s) => out.add(s),
    );
  }
  return [...out];
}

router.post("/menu/analyze", async (req, res) => {
  const parsed = AnalyzeMenuBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { imageBase64, mimeType, menuLanguage, restrictions } = parsed.data;
  const restrictionList =
    restrictions.length > 0 ? restrictions.join(", ") : "None specified";

  // ── SSE setup ─────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const abortController = new AbortController();
  let clientGone = false;
  req.on("close", () => {
    clientGone = true;
    abortController.abort();
  });

  const send = (event: string, data: unknown) => {
    if (clientGone) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Heartbeat keeps the connection open through proxies during the
  // (relatively long) layout pass. Comments are ignored by SSE clients.
  const heartbeat = setInterval(() => {
    if (clientGone) return;
    res.write(`: ping\n\n`);
  }, 15_000);

  const finish = () => {
    clearInterval(heartbeat);
    if (!clientGone) res.end();
  };

  try {
    // ── Single-pass: layout + per-item analysis in ONE Gemini call ───────
    const prompt = `You are a food safety assistant for a traveler. The image is a restaurant menu (written in ${menuLanguage}).

User dietary restrictions: ${restrictionList}

For EVERY distinct menu entry visible in the image, return one object containing BOTH the layout box AND the safety analysis. Use common knowledge of each dish (the well-known recipe behind the name) to decide safety.

Each item must include:
- "name": original-language item name as printed on the menu
- "box": tight bounding box around just the item name line, normalized integers 0–1000 (ymin,xmin,ymax,xmax; 0,0 = top-left)
- "translatedName": English translation of the item name
- "description": brief 1-sentence description of what the dish typically is
- "safetyLevel": "safe" | "warning" | "danger"
- "conflictingRestrictions": list of the user's restrictions this dish conflicts with (empty array if none)
- "allergenFlags": list of { "name": "Peanuts", "severity": "high" | "medium" | "low" }

Safety rules:
- "danger": directly conflicts with the user's restrictions OR almost certainly contains a major allergen (peanuts, tree nuts, shellfish, eggs, dairy, gluten, soy)
- "warning": may contain traces or unclear ingredients
- "safe": appears safe for this user
Always flag common allergens even if the user did not list them: peanuts, tree nuts, shellfish, milk/dairy, eggs, wheat/gluten, soy, fish.

Return ONLY valid JSON of shape:
{"detectedLanguage":"language name","items":[{"name":"...","box":{"ymin":0,"xmin":0,"ymax":0,"xmax":0},"translatedName":"...","description":"...","safetyLevel":"safe","conflictingRestrictions":[],"allergenFlags":[]}]}`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: abortController.signal,
      },
    });

    type RawItem = {
      name?: string;
      box?: BBox;
      translatedName?: string;
      description?: string;
      safetyLevel?: AnalyzedItem["safetyLevel"];
      conflictingRestrictions?: unknown;
      allergenFlags?: unknown;
    };

    const normalize = (it: RawItem, i: number): AnalyzedItem & { id: number } => {
      const box = it.box;
      return {
        name: it.name as string,
        translatedName:
          typeof it.translatedName === "string" && it.translatedName.trim()
            ? it.translatedName
            : (it.name as string),
        description: typeof it.description === "string" ? it.description : "",
        safetyLevel:
          it.safetyLevel === "danger" ||
          it.safetyLevel === "warning" ||
          it.safetyLevel === "safe"
            ? it.safetyLevel
            : "warning",
        conflictingRestrictions: Array.isArray(it.conflictingRestrictions)
          ? (it.conflictingRestrictions as unknown[]).filter(
              (s): s is string => typeof s === "string",
            )
          : [],
        allergenFlags: Array.isArray(it.allergenFlags)
          ? (it.allergenFlags as unknown[]).filter(
              (f): f is AllergenFlag =>
                !!f &&
                typeof (f as AllergenFlag).name === "string" &&
                typeof (f as AllergenFlag).severity === "string",
            )
          : [],
        boundingBox: box,
        nameBox: box,
        citations: [],
        id: i,
      };
    };

    // Streaming JSON walker: accumulate text, scan the items array for
    // top-level objects, and emit each as soon as its closing `}` lands.
    let buffer = "";
    let cursor = 0;            // index in buffer to resume scanning from
    let inItems = false;       // have we crossed `"items":[`?
    let depth = 0;             // brace depth inside the items array
    let itemStart = -1;        // start index of the current top-level item
    let inString = false;      // currently inside a JSON string?
    let escape = false;        // previous char was a backslash inside a string?
    let layoutSent = false;
    let detectedLanguage = menuLanguage;
    let nextId = 0;

    const tryEmitDetectedLanguage = () => {
      if (layoutSent) return;
      const m = buffer.match(/"detectedLanguage"\s*:\s*"([^"]+)"/);
      if (m) detectedLanguage = m[1] || menuLanguage;
    };

    const emitLayoutOnce = () => {
      if (layoutSent) return;
      tryEmitDetectedLanguage();
      send("layout", { items: [], detectedLanguage });
      layoutSent = true;
    };

    const processBuffer = () => {
      if (!inItems) {
        const idx = buffer.indexOf('"items"', cursor);
        if (idx === -1) return;
        const bracket = buffer.indexOf("[", idx);
        if (bracket === -1) return;
        cursor = bracket + 1;
        inItems = true;
        emitLayoutOnce();
      }

      while (cursor < buffer.length) {
        const ch = buffer[cursor];
        if (inString) {
          if (escape) escape = false;
          else if (ch === "\\") escape = true;
          else if (ch === '"') inString = false;
          cursor++;
          continue;
        }
        if (ch === '"') {
          inString = true;
          cursor++;
          continue;
        }
        if (ch === "{") {
          if (depth === 0) itemStart = cursor;
          depth++;
          cursor++;
          continue;
        }
        if (ch === "}") {
          depth--;
          cursor++;
          if (depth === 0 && itemStart !== -1) {
            const slice = buffer.slice(itemStart, cursor);
            itemStart = -1;
            try {
              const obj = JSON.parse(slice) as RawItem;
              if (obj && typeof obj.name === "string" && obj.name.trim()) {
                const id = nextId++;
                const item = normalize(obj, id);
                send("item", { id, item });
                send("progress", { completed: id + 1, failed: 0, total: id + 1 });
              }
            } catch {
              // Partial / malformed item — skip silently.
            }
          }
          continue;
        }
        if (ch === "]" && depth === 0) {
          // Hit end of items array.
          cursor++;
          break;
        }
        cursor++;
      }
    };

    for await (const chunk of stream) {
      if (clientGone) return finish();
      const text = chunk.text ?? "";
      if (!text) continue;
      buffer += text;
      // Try to grab detectedLanguage early so the layout event has it.
      if (!layoutSent) tryEmitDetectedLanguage();
      processBuffer();
    }

    if (clientGone) return finish();

    // Final flush (in case the stream never crossed `"items":[`).
    if (!layoutSent) {
      try {
        const parsed = JSON.parse(buffer) as { items?: RawItem[]; detectedLanguage?: string };
        detectedLanguage = parsed.detectedLanguage ?? detectedLanguage;
        const arr = Array.isArray(parsed.items) ? parsed.items : [];
        send("layout", { items: [], detectedLanguage });
        layoutSent = true;
        for (const obj of arr) {
          if (obj && typeof obj.name === "string" && obj.name.trim()) {
            const id = nextId++;
            send("item", { id, item: normalize(obj, id) });
          }
        }
      } catch {
        send("layout", { items: [], detectedLanguage });
      }
    }

    void buildCitationChains; // citations now best-effort and skipped in the hot path

    send("progress", { completed: nextId, failed: 0, total: nextId });
    send("done", { total: nextId, completed: nextId, failed: 0 });
    finish();
  } catch (err) {
    console.error("Menu analysis error:", err);
    if (!clientGone) {
      send("error", {
        message: err instanceof Error ? err.message : "Failed to analyze menu",
      });
    }
    finish();
  }
});

router.get("/menu/ingredient-graph/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const lang = typeof req.query.lang === "string" ? req.query.lang : "auto";
  const k = Math.min(20, Math.max(1, Number(req.query.k ?? 5) || 5));
  const allergensParam = typeof req.query.allergens === "string" ? req.query.allergens : "";
  if (!q) {
    res.status(400).json({ error: "q query param is required" });
    return;
  }
  try {
    const { resolveIngredient, buildCitationChains } = await import(
      "../lib/ingredient-graph"
    );
    const matches = await resolveIngredient(q, k);
    const allergenSlugs = allergensParam
      ? allergensParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [
          "peanut","tree-nut","milk","egg","wheat","soy","fish","shellfish",
          "sesame","mustard","sulphite","celery",
        ];
    const chains = await buildCitationChains([q], allergenSlugs);
    res.json({
      query: q,
      language: lang,
      matches: matches.map((m) => ({
        ingredient: m.ingredient,
        distance: m.distance,
      })),
      citations: chains,
    });
  } catch (err) {
    console.error("Graph search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/menu/ingredient-graph/lookup", async (req, res) => {
  const slug = typeof req.query.slug === "string" ? req.query.slug : "";
  if (!slug) {
    res.status(400).json({ error: "slug query param is required" });
    return;
  }
  try {
    const { db, ingredients, ingredientAliases, ingredientAllergens, allergens } =
      await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [ing] = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.slug, slug))
      .limit(1);
    if (!ing) {
      res.status(404).json({ error: "Ingredient not found" });
      return;
    }
    const aliases = await db
      .select({ alias: ingredientAliases.alias, language: ingredientAliases.language })
      .from(ingredientAliases)
      .where(eq(ingredientAliases.ingredientId, ing.id));
    const tagged = await db
      .select({
        slug: allergens.slug,
        name: allergens.name,
        category: allergens.category,
      })
      .from(ingredientAllergens)
      .innerJoin(allergens, eq(ingredientAllergens.allergenId, allergens.id))
      .where(eq(ingredientAllergens.ingredientId, ing.id));
    res.json({
      ingredient: {
        id: ing.id,
        slug: ing.slug,
        name: ing.canonicalName,
        category: ing.category,
        description: ing.description,
        source: ing.source,
        sourceUrl: ing.sourceUrl,
        aliases,
      },
      allergens: tagged,
    });
  } catch (err) {
    console.error("Graph lookup failed:", err);
    res.status(500).json({ error: "Lookup failed" });
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
