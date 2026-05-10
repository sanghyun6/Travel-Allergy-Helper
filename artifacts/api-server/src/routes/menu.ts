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

import {
  cuisineFacts,
  evaluateDish,
  extractFactsFromText,
  loadFactsForScopes,
  normalizeAllergenList,
  normalizeCuisine,
} from "../lib/cross-contam";

/**
 * Heuristically pull disclaimer-like sentences out of OCR/menu text so we
 * can run them through the LLM fact-extractor at scan time.
 * Conservative: only return sentences mentioning explicit cross-contact
 * keywords to keep token cost (and false positives) bounded.
 */
function findMenuDisclaimerText(buffer: string): string {
  if (!buffer) return "";
  const KEYWORDS =
    /\b(may contain|cross[- ]contam|cross[- ]contact|shared (fryer|grill|wok|kitchen|equipment|utensil)|cooked in (the same|shared)|peanut oil|nut[- ]free|gluten[- ]free kitchen|allergen|allergy notice|dedicated fryer|prepared in a kitchen)\b/i;
  // Strip JSON noise: keep alphanumeric & punctuation runs.
  const text = buffer
    .replace(/[{}\[\]"]/g, " ")
    .replace(/\s+/g, " ");
  const sentences = text.split(/(?<=[.!?])\s+/);
  const hits = sentences.filter((s) => KEYWORDS.test(s) && s.length < 400);
  // Cap at ~2k chars to bound LLM cost.
  let out = "";
  for (const s of hits) {
    if (out.length + s.length > 2000) break;
    out += (out ? " " : "") + s.trim();
  }
  return out;
}

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
  // Push a byte immediately so the Replit preview proxy commits the
  // streaming connection and does not hit its ~15s idle-timeout before
  // the first model token arrives.
  res.write(`: open\n\n`);

  const abortController = new AbortController();
  let clientGone = false;
  // Use res.on('close') — req.on('close') fires as soon as Express finishes
  // consuming the request body, which would abort the upstream fetch instantly.
  // res 'close' fires only when the response/socket is actually torn down.
  res.on("close", () => {
    if (!res.writableEnded) {
      clientGone = true;
      abortController.abort();
    }
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
  }, 5_000);

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

    const googleKey = process.env.GOOGLE_API_KEY!;
    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse";
    const openaiResp = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": googleKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: abortController.signal,
    });

    if (!openaiResp.ok || !openaiResp.body) {
      const errText = await openaiResp.text().catch(() => "");
      throw new Error(`Gemini error ${openaiResp.status}: ${errText.slice(0, 500)}`);
    }

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
    // Track emitted items so we can score cross-contamination as a final
    // event on the same SSE stream (Step 4 of the cross-contam contract).
    const emittedDishes: { name: string; translatedName?: string; description?: string }[] = [];

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
                emittedDishes.push({
                  name: item.name,
                  translatedName: item.translatedName,
                  description: item.description,
                });
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

    const reader = openaiResp.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    streamLoop: while (true) {
      if (clientGone) {
        try { await reader.cancel(); } catch { /* ignore */ }
        return finish();
      }
      const { value, done } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = sseBuffer.indexOf("\n")) !== -1) {
        const line = sseBuffer.slice(0, nl).trim();
        sseBuffer = sseBuffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") break streamLoop;
        try {
          const evt = JSON.parse(payload) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
            }>;
          };
          const text =
            evt.candidates?.[0]?.content?.parts
              ?.map((p) => p.text ?? "")
              .join("") ?? "";
          if (!text) continue;
          buffer += text;
          if (!layoutSent) tryEmitDetectedLanguage();
          processBuffer();
        } catch {
          // Skip malformed SSE chunks.
        }
      }
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
            const item = normalize(obj, id);
            send("item", { id, item });
            emittedDishes.push({
              name: item.name,
              translatedName: item.translatedName,
              description: item.description,
            });
          }
        }
      } catch {
        send("layout", { items: [], detectedLanguage });
      }
    }

    void buildCitationChains; // citations now best-effort and skipped in the hot path

    send("progress", { completed: nextId, failed: 0, total: nextId });

    // Score cross-contamination for the whole batch and emit it as the
    // final event before "done". This is the in-stream contract referenced
    // by Step 4 of the cross-contam task — the per-dish badges/traces ship
    // with the scan results in one connection.
    try {
      const allergens = normalizeAllergenList(restrictions);
      if (allergens.length > 0 && emittedDishes.length > 0) {
        const cuisine = normalizeCuisine(detectedLanguage ?? menuLanguage);
        const cFacts = cuisineFacts(cuisine);

        // Auto-extract menu disclaimers from the OCR buffer for THIS
        // request only. We deliberately do NOT persist these to the
        // shared cuisine scope: the request has no stable restaurant
        // identity, so persisting would let one restaurant's disclaimer
        // poison the cuisine baseline that every other restaurant in
        // that cuisine inherits. Kept ephemeral instead.
        let extractedDisclaimerFacts: typeof cFacts = [];
        if (cuisine) {
          const disclaimer = findMenuDisclaimerText(buffer);
          if (disclaimer) {
            try {
              extractedDisclaimerFacts = await extractFactsFromText(
                disclaimer,
                { kind: "cuisine", value: cuisine },
                "menu_disclaimer",
              );
            } catch (e) {
              console.warn("[menu/analyze] disclaimer extraction failed:", e);
            }
          }
        }

        // Merge: cuisine defaults + persisted cuisine-scoped facts
        // (curated/seeded only, since we no longer write to this scope
        // from untrusted inputs) + the request-local disclaimer facts
        // we just extracted. Restaurant-scoped overrides flow through
        // the explicit /cross-contamination/score endpoint.
        const persistedCuisineFacts = cuisine
          ? await loadFactsForScopes([{ kind: "cuisine", value: cuisine }]).catch(() => [])
          : [];
        const merged = [
          ...cFacts,
          ...persistedCuisineFacts,
          ...extractedDisclaimerFacts,
        ];
        const items = emittedDishes.map((d) => {
          const r = evaluateDish(d, allergens, merged);
          return {
            name: d.name,
            risk: r.risk,
            firedRules: r.fired.map((f) => ({
              ruleId: f.ruleId,
              description: f.description,
              severity: f.severity,
              allergen: f.allergen,
              explanation: f.explanation,
              fact: {
                factType: f.fact.factType,
                confidence: f.fact.confidence,
                source: f.fact.source,
                sourceSnippet: f.fact.sourceSnippet ?? null,
                scopeKind: f.fact.scopeKind,
                scopeValue: f.fact.scopeValue,
              },
            })),
            unknownAllergens: r.unknownAllergens,
          };
        });
        send("cross-contamination", { items, cuisine });
      }
    } catch (ccErr) {
      console.warn("[menu/analyze] cross-contam scoring failed:", ccErr);
    }

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

// SSE variant of ordering-instructions. Emits one event per translated item
// as it finishes (parallel Gemini calls), then a final `full` event with the
// combined order phrase, then `done`. This way the user sees per-item
// translations stream in instead of staring at a spinner for the whole batch.
router.post("/menu/ordering-instructions/stream", async (req, res) => {
  const parsed = GetOrderingInstructionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { items, targetLanguage, restrictions, menuLanguage } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`: open\n\n`);

  const abortController = new AbortController();
  let clientGone = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      clientGone = true;
      abortController.abort();
    }
  });

  const send = (event: string, data: unknown) => {
    if (clientGone) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    if (clientGone) return;
    res.write(`: ping\n\n`);
  }, 5_000);

  const finish = () => {
    clearInterval(heartbeat);
    if (!clientGone) res.end();
  };

  const restrictionList =
    restrictions.length > 0 ? restrictions.join(", ") : "None";

  const itemPrompt = (item: string) => `You are a food safety assistant helping a traveler order food safely.

The menu is in ${menuLanguage}. The user wants to order this item: "${item}"
The user's dietary restrictions: ${restrictionList}
The user's native language: ${targetLanguage}

Generate ordering instructions for this single item:
1. A natural phrase to say in ${menuLanguage} when ordering this item (include a polite allergy disclaimer in ${menuLanguage} if the user has restrictions)
2. A phonetic pronunciation guide for that phrase, written for a ${targetLanguage} speaker

Return ONLY valid JSON:
{"phrase":"...","pronunciation":"..."}`;

  const fullPrompt = `You are a food safety assistant helping a traveler order food safely.

The menu is in ${menuLanguage}. The user wants to order these items together:
${items.map((it, i) => `${i + 1}. ${it}`).join("\n")}

The user's dietary restrictions: ${restrictionList}
The user's native language: ${targetLanguage}

Generate ONE combined natural phrase in ${menuLanguage} the user can show or say to order everything at once, including a polite allergy disclaimer if there are restrictions.

Return ONLY valid JSON: {"fullOrderPhrase":"..."}`;

  const callGemini = async (prompt: string): Promise<string> => {
    const resp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GOOGLE_API_KEY!,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: abortController.signal,
      },
    );
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Gemini ${resp.status}: ${t.slice(0, 200)}`);
    }
    const json = (await resp.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  };

  send("started", { total: items.length });

  // Kick off all per-item translations + the combined phrase in parallel,
  // emitting an event as each finishes.
  const itemPromises = items.map(async (item, index) => {
    try {
      const text = await callGemini(itemPrompt(item));
      const obj = JSON.parse(text) as { phrase?: string; pronunciation?: string };
      send("item", {
        index,
        item,
        phrase: obj.phrase ?? "",
        pronunciation: obj.pronunciation ?? "",
      });
    } catch (err) {
      if (clientGone) return;
      send("item_error", {
        index,
        item,
        message: err instanceof Error ? err.message : "Translation failed",
      });
    }
  });

  const fullPromise = (async () => {
    try {
      const text = await callGemini(fullPrompt);
      const obj = JSON.parse(text) as { fullOrderPhrase?: string };
      send("full", { fullOrderPhrase: obj.fullOrderPhrase ?? "" });
    } catch (err) {
      if (clientGone) return;
      send("full_error", {
        message: err instanceof Error ? err.message : "Failed to compose full phrase",
      });
    }
  })();

  try {
    await Promise.all([...itemPromises, fullPromise]);
    send("done", { total: items.length });
  } catch (err) {
    if (!clientGone) {
      send("error", {
        message: err instanceof Error ? err.message : "Stream failed",
      });
    }
  } finally {
    finish();
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
