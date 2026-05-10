export type FactType =
  | "shared_fryer"
  | "shared_grill"
  | "shared_wok"
  | "flour_dusting"
  | "shared_utensils_raw"
  | "bakery_cross_contact"
  | "peanut_oil_use"
  | "may_contain_traces"
  | "dedicated_fryer"
  | "nut_free_kitchen"
  | "gluten_free_kitchen";

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type FactSource =
  | "menu_disclaimer"
  | "review"
  | "cuisine_default"
  | "user_note";

export type PracticeFact = {
  id?: number;
  scopeKind: "cuisine" | "restaurant";
  scopeValue: string;
  factType: FactType;
  confidence: number;
  source: FactSource;
  sourceSnippet?: string | null;
  // For traces returned to clients — which allergens this fact references.
  // Optional: extracted facts may include this; cuisine defaults populate it.
  allergens?: string[];
};

export type DishContext = {
  name: string;
  translatedName?: string;
  description?: string;
  ingredients?: string[];
  categories: Set<string>; // fried, grilled, sushi, bakery, fritter, breaded, sauced
};

export type FiredRule = {
  ruleId: string;
  description: string;
  severity: Exclude<RiskLevel, "unknown">;
  allergen: string;
  fact: PracticeFact;
  explanation: string;
};

export type CrossContamResult = {
  risk: RiskLevel;
  fired: FiredRule[];
  // All facts that were *considered* (in scope, regardless of firing).
  consideredFacts: PracticeFact[];
  // Allergens we could not evaluate (no rule fired and no relevant fact present).
  unknownAllergens: string[];
};
