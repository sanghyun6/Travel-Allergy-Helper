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
    // ── Pass 1: fast layout / OCR ───────────────────────────────────────
    const layoutPrompt = `You are an OCR + layout detector for a restaurant menu photo (written in ${menuLanguage}).

Detect every distinct menu entry in the image. For each entry return ONLY:
- "name": the original-language item name as printed on the menu
- "boundingBox": tight box around the ENTIRE menu entry row (name + price + description if present)
- "nameBox": tight box around ONLY the first line of the original-language item name (used to overlay a label on top of the foreign text)

All boxes use normalized integers 0–1000 (0,0 = top-left, 1000,1000 = bottom-right).

Do NOT translate, describe, or analyze ingredients. This pass must be FAST.

Return ONLY valid JSON of shape:
{
  "items": [
    { "name": "...", "boundingBox": {"ymin":0,"xmin":0,"ymax":0,"xmax":0}, "nameBox": {"ymin":0,"xmin":0,"ymax":0,"xmax":0} }
  ],
  "detectedLanguage": "language name"
}`;

    const layoutResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: layoutPrompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 4096,
        abortSignal: abortController.signal,
      },
    });

    if (clientGone) return finish();

    let layoutParsed: { items?: LayoutItem[]; detectedLanguage?: string };
    try {
      layoutParsed = JSON.parse(layoutResponse.text ?? "{}");
    } catch {
      layoutParsed = {};
    }

    const rawItems = Array.isArray(layoutParsed.items) ? layoutParsed.items : [];
    const detectedLanguage = layoutParsed.detectedLanguage ?? menuLanguage;

    const layoutItems: LayoutItem[] = rawItems
      .filter((it) => it && typeof it.name === "string" && it.name.trim().length > 0)
      .map((it, i) => ({
        id: i,
        name: it.name,
        boundingBox: it.boundingBox,
        nameBox: it.nameBox,
      }));

    send("layout", {
      items: layoutItems,
      detectedLanguage,
    });

    if (layoutItems.length === 0) {
      send("done", { total: 0, completed: 0 });
      return finish();
    }

    send("progress", { completed: 0, total: layoutItems.length });

    // ── Pass 2: per-item translation + safety analysis (parallel) ───────
    // Each item is processed independently. A failure in one item never
    // breaks the rest of the scan — it surfaces as an `item_error` event
    // with the affected item's id. We wait for ALL items to settle before
    // emitting `done` so we never close the stream while writes are still
    // in flight.
    const CONCURRENCY = 10;
    let completed = 0;
    let failed = 0;
    let inFlight = 0;
    let cursor = 0;

    const analyzeOne = async (item: LayoutItem): Promise<void> => {
      if (clientGone) return;

      const itemPrompt = `You are a food safety assistant for travelers.

Menu item from a ${detectedLanguage} restaurant: "${item.name}"
User dietary restrictions: ${restrictionList}

Based on common knowledge of this dish (no image is provided — work from the name alone), return JSON:
{
  "translatedName": "English translation of the item name",
  "description": "brief 1-sentence description of what the dish typically is",
  "safetyLevel": "safe" | "warning" | "danger",
  "conflictingRestrictions": ["restriction1"],
  "allergenFlags": [ { "name": "Peanuts", "severity": "high" | "medium" | "low" } ],
  "extractedIngredients": ["ingredient or sauce names you see / infer, in original language preferred"]
}

For "extractedIngredients", list the SPECIFIC ingredients, sauces, broths, condiments, or
named components that go into this dish — both ones written on the menu and well-known
defaults (e.g. for "Pad See Ew" include "soy sauce" and "oyster sauce" even if not printed).
Keep names short (one phrase each), use the menu's language where possible.

Safety levels:
- "danger": directly conflicts with the user's restrictions OR almost certainly contains a major allergen (peanuts, tree nuts, shellfish, eggs, dairy, gluten, soy)
- "warning": may contain traces or unclear ingredients
- "safe": appears safe for this user

Always flag common allergens even if user did not list them: peanuts, tree nuts, shellfish, milk/dairy, eggs, wheat/gluten, soy, fish.

Return ONLY valid JSON, no markdown.`;

      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-lite",
          contents: [
            {
              role: "user",
              parts: [{ text: itemPrompt }],
            },
          ],
          config: {
            responseMimeType: "application/json",
            maxOutputTokens: 512,
            abortSignal: abortController.signal,
          },
        });

        if (clientGone) return;

        let analysis: Partial<AnalyzedItem> & { extractedIngredients?: string[] } = {};
        try {
          analysis = JSON.parse(response.text ?? "{}");
        } catch {
          analysis = {};
        }

        // Resolve ingredients through the knowledge graph and build citation
        // chains for whichever ingredients trace to one of the user's
        // (or default) allergens. The dish's own name is also resolved so
        // dishes like "Pad See Ew" trigger via the graph even if the LLM
        // forgets a sauce.
        let citations: CitationChain[] = [];
        try {
          const ingredientTexts = [
            item.name,
            ...(Array.isArray(analysis.extractedIngredients)
              ? analysis.extractedIngredients.filter(
                  (s): s is string => typeof s === "string",
                )
              : []),
          ];
          const allergenSlugs = restrictionsToAllergenSlugs(restrictions);
          citations = await buildCitationChains(ingredientTexts, allergenSlugs);
        } catch (graphErr) {
          // Graph is best-effort — never break the main analysis on a graph error.
          console.error(`Citation graph failed for item ${item.id}:`, graphErr);
        }

        const analyzed: AnalyzedItem = {
          name: item.name,
          translatedName:
            typeof analysis.translatedName === "string" && analysis.translatedName.trim()
              ? analysis.translatedName
              : item.name,
          description:
            typeof analysis.description === "string" ? analysis.description : "",
          safetyLevel:
            analysis.safetyLevel === "danger" ||
            analysis.safetyLevel === "warning" ||
            analysis.safetyLevel === "safe"
              ? analysis.safetyLevel
              : "warning",
          conflictingRestrictions: Array.isArray(analysis.conflictingRestrictions)
            ? analysis.conflictingRestrictions.filter(
                (s): s is string => typeof s === "string",
              )
            : [],
          allergenFlags: Array.isArray(analysis.allergenFlags)
            ? analysis.allergenFlags.filter(
                (f): f is AllergenFlag =>
                  !!f && typeof f.name === "string" && typeof f.severity === "string",
              )
            : [],
          boundingBox: item.boundingBox,
          nameBox: item.nameBox,
          citations,
        };

        completed++;
        send("item", { id: item.id, item: analyzed });
      } catch (err) {
        if (clientGone || abortController.signal.aborted) return;
        failed++;
        const message =
          err instanceof Error ? err.message : "Item analysis failed";
        console.error(`Per-item analysis failed for item ${item.id}:`, err);
        send("item_error", { id: item.id, name: item.name, message });
      } finally {
        if (!clientGone) {
          send("progress", {
            completed,
            failed,
            total: layoutItems.length,
          });
        }
      }
    };

    // Manual concurrency-limited runner over Promise.allSettled semantics:
    // every item runs to completion (success OR failure) before we resolve.
    await new Promise<void>((resolve) => {
      const launchNext = () => {
        if (clientGone) {
          if (inFlight === 0) resolve();
          return;
        }
        while (inFlight < CONCURRENCY && cursor < layoutItems.length) {
          const item = layoutItems[cursor++];
          inFlight++;
          analyzeOne(item).finally(() => {
            inFlight--;
            if (cursor >= layoutItems.length && inFlight === 0) {
              resolve();
            } else {
              launchNext();
            }
          });
        }
        if (cursor >= layoutItems.length && inFlight === 0) resolve();
      };
      launchNext();
    });

    if (clientGone) return finish();

    send("done", {
      total: layoutItems.length,
      completed,
      failed,
    });
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
