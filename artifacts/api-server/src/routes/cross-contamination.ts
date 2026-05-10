import { Router } from "express";
import {
  cuisineFacts,
  evaluateDish,
  extractFactsFromText,
  persistFacts,
  loadFactsForScopes,
  ensurePracticesSchema,
  normalizeAllergenList,
  normalizeCuisine,
  type PracticeFact,
} from "../lib/cross-contam";

const router = Router();

type DishInput = {
  name: string;
  translatedName?: string;
  description?: string;
  ingredients?: string[];
};

router.post("/cross-contamination/score", async (req, res) => {
  try {
    const body = req.body ?? {};
    const dishes: DishInput[] = Array.isArray(body.dishes) ? body.dishes : [];
    const rawAllergens: string[] = Array.isArray(body.allergens)
      ? body.allergens.map(String)
      : [];
    const allergens = normalizeAllergenList(rawAllergens);
    const cuisine = normalizeCuisine(body.cuisine);
    const restaurantId: string | null =
      typeof body.restaurantId === "string" && body.restaurantId.trim()
        ? body.restaurantId.trim().toLowerCase()
        : null;
    const reviewText: string | null =
      typeof body.reviewText === "string" && body.reviewText.trim()
        ? body.reviewText
        : null;
    const menuDisclaimer: string | null =
      typeof body.menuDisclaimer === "string" && body.menuDisclaimer.trim()
        ? body.menuDisclaimer
        : null;

    if (dishes.length === 0) {
      res.json({ items: [], facts: [] });
      return;
    }

    // 1. Extract facts from any provided text. Trust boundary:
    //    - Restaurant-scoped facts (we have a stable restaurantId) are
    //      persisted so future scans of the same restaurant benefit.
    //    - Cuisine-only facts are kept REQUEST-LOCAL (ephemeral). One
    //      restaurant's review/disclaimer must NOT be allowed to poison
    //      the global cuisine baseline used by every other restaurant.
    const extracted: PracticeFact[] = [];
    const persistable: PracticeFact[] = [];
    if (reviewText && (restaurantId || cuisine)) {
      const scope = restaurantId
        ? { kind: "restaurant" as const, value: restaurantId }
        : { kind: "cuisine" as const, value: cuisine! };
      const facts = await extractFactsFromText(reviewText, scope, "review");
      extracted.push(...facts);
      if (restaurantId) persistable.push(...facts);
    }
    if (menuDisclaimer && (restaurantId || cuisine)) {
      const scope = restaurantId
        ? { kind: "restaurant" as const, value: restaurantId }
        : { kind: "cuisine" as const, value: cuisine! };
      const facts = await extractFactsFromText(menuDisclaimer, scope, "menu_disclaimer");
      extracted.push(...facts);
      if (restaurantId) persistable.push(...facts);
    }
    if (persistable.length > 0) {
      await persistFacts(persistable).catch((e) =>
        console.warn("[cross-contam] persist failed", e),
      );
    }

    // 2. Assemble facts in scope: cuisine defaults + restaurant overrides + extracted.
    const scopeKeys: { kind: "cuisine" | "restaurant"; value: string }[] = [];
    if (cuisine) scopeKeys.push({ kind: "cuisine", value: cuisine });
    if (restaurantId) scopeKeys.push({ kind: "restaurant", value: restaurantId });
    const persistedFacts = await loadFactsForScopes(scopeKeys);
    const cuisineDefaults = cuisineFacts(cuisine);

    // Restaurant facts take precedence: if a restaurant-scoped fact of the
    // same type exists, drop the cuisine default of that type.
    const haveRestaurantTypes = new Set(
      persistedFacts
        .filter((f) => f.scopeKind === "restaurant")
        .map((f) => f.factType),
    );
    // Build merged scope. We deliberately do NOT re-include `extracted` here
    // because persistFacts already wrote them and loadFactsForScopes reads
    // them back — including both would double-count rules in the trace.
    // If persistence failed, fall back to the in-memory extracted set.
    const haveExtractedKeys = new Set(
      persistedFacts.map((f) => `${f.factType}::${f.sourceSnippet ?? ""}`),
    );
    const extractedFallback = extracted.filter(
      (f) => !haveExtractedKeys.has(`${f.factType}::${f.sourceSnippet ?? ""}`),
    );
    const mergedFacts: PracticeFact[] = [
      ...cuisineDefaults.filter((f) => !haveRestaurantTypes.has(f.factType)),
      ...persistedFacts,
      ...extractedFallback,
    ];

    // 3. Score each dish.
    const items = dishes.map((d) => {
      const result = evaluateDish(d, allergens, mergedFacts);
      return {
        name: d.name,
        risk: result.risk,
        firedRules: result.fired.map((f) => ({
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
        unknownAllergens: result.unknownAllergens,
      };
    });

    res.json({
      items,
      cuisine,
      facts: mergedFacts.map((f) => ({
        factType: f.factType,
        confidence: f.confidence,
        source: f.source,
        sourceSnippet: f.sourceSnippet ?? null,
        scopeKind: f.scopeKind,
        scopeValue: f.scopeValue,
        allergens: f.allergens ?? [],
      })),
      extractedCount: extracted.length,
    });
  } catch (err) {
    console.error("[cross-contam] score failed", err);
    res.status(500).json({ error: "Cross-contamination scoring failed" });
  }
});

router.get("/cross-contamination/health", async (_req, res) => {
  const ok = await ensurePracticesSchema();
  res.json({ schemaReady: ok });
});

export default router;
