/**
 * Thin wrapper for the cross-contamination scoring endpoint. Like risk-api.ts
 * we hit the route directly rather than going through the orval-generated
 * client so we don't have to regenerate it for an internal route.
 */
const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export type CrossContamRisk = "low" | "medium" | "high" | "unknown";

export type FiredRule = {
  ruleId: string;
  description: string;
  severity: "low" | "medium" | "high";
  allergen: string;
  explanation: string;
  fact: {
    factType: string;
    confidence: number;
    source: "menu_disclaimer" | "review" | "cuisine_default" | "user_note";
    sourceSnippet: string | null;
    scopeKind: "cuisine" | "restaurant";
    scopeValue: string;
  };
};

export type CrossContamItem = {
  name: string;
  risk: CrossContamRisk;
  firedRules: FiredRule[];
  unknownAllergens: string[];
};

export type CrossContamResponse = {
  items: CrossContamItem[];
  cuisine: string | null;
  facts: {
    factType: string;
    confidence: number;
    source: string;
    sourceSnippet: string | null;
    scopeKind: string;
    scopeValue: string;
    allergens: string[];
  }[];
  extractedCount: number;
};

export type DishForCrossContam = {
  name: string;
  translatedName?: string;
  description?: string;
  ingredients?: string[];
};

export async function scoreCrossContamination(input: {
  dishes: DishForCrossContam[];
  allergens: string[];
  cuisine?: string | null;
  restaurantId?: string | null;
  reviewText?: string | null;
  menuDisclaimer?: string | null;
}): Promise<CrossContamResponse | null> {
  if (input.dishes.length === 0 || input.allergens.length === 0) return null;
  try {
    const res = await fetch(`${API_BASE}/cross-contamination/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dishes: input.dishes,
        allergens: input.allergens,
        cuisine: input.cuisine ?? null,
        restaurantId: input.restaurantId ?? null,
        reviewText: input.reviewText ?? null,
        menuDisclaimer: input.menuDisclaimer ?? null,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as CrossContamResponse;
  } catch (err) {
    console.error("scoreCrossContamination failed", err);
    return null;
  }
}
