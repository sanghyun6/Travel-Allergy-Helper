/**
 * Cuisine-level kitchen-practice defaults. Each fact represents the *typical*
 * kitchen practice for that cuisine, used when we have no restaurant-specific
 * information. Restaurant-scoped facts always override these.
 *
 * Confidence values are deliberately moderate (0.4–0.7) so the engine knows
 * to surface "based on cuisine norms" wording in the trace and so a single
 * restaurant disclaimer can flip the result.
 */
import type { PracticeFact, FactType } from "./types";

type Default = {
  factType: FactType;
  confidence: number;
  allergens: string[];
  note: string;
};

const DEFAULTS: Record<string, Default[]> = {
  japanese: [
    { factType: "shared_fryer", confidence: 0.75, allergens: ["shellfish", "fish", "wheat"], note: "Tempura shops typically fry shrimp/fish in shared oil." },
    { factType: "shared_utensils_raw", confidence: 0.6, allergens: ["fish", "shellfish"], note: "Sushi counters share boards/knives across raw fish & shellfish." },
  ],
  chinese: [
    { factType: "shared_wok", confidence: 0.7, allergens: ["shellfish", "egg", "soy", "peanut"], note: "Wok stations cook many dishes in sequence with minimal cleaning." },
    { factType: "may_contain_traces", confidence: 0.5, allergens: ["soy"], note: "Soy sauce is used widely as base seasoning." },
  ],
  thai: [
    { factType: "shared_wok", confidence: 0.7, allergens: ["shellfish", "fish", "peanut"], note: "Wok cooking with fish sauce/shrimp paste is near-universal." },
    { factType: "may_contain_traces", confidence: 0.6, allergens: ["fish", "shellfish"], note: "Fish sauce / shrimp paste are pantry staples." },
  ],
  vietnamese: [
    { factType: "may_contain_traces", confidence: 0.6, allergens: ["fish", "shellfish"], note: "Nuoc mam (fish sauce) is in nearly every savory dish." },
  ],
  korean: [
    { factType: "shared_grill", confidence: 0.65, allergens: ["shellfish", "fish"], note: "BBQ tabletops grill seafood and meat on the same surface." },
  ],
  indonesian: [
    { factType: "may_contain_traces", confidence: 0.6, allergens: ["peanut", "shellfish"], note: "Peanut sauces and shrimp paste (terasi) are common." },
  ],
  indian: [
    { factType: "shared_fryer", confidence: 0.55, allergens: ["wheat"], note: "Pakora/samosa fryers are shared across breaded items." },
  ],
  italian: [
    { factType: "flour_dusting", confidence: 0.7, allergens: ["wheat"], note: "Pasta and pizza stations dust everything with semolina/flour." },
  ],
  french: [
    { factType: "bakery_cross_contact", confidence: 0.55, allergens: ["wheat", "tree-nut", "egg"], note: "Patisseries cross-contact pastry, nuts, and eggs in the same area." },
  ],
  american: [
    { factType: "shared_fryer", confidence: 0.7, allergens: ["wheat"], note: "Diner fryers cook fries, breaded chicken, and onion rings together." },
  ],
  mexican: [
    { factType: "shared_fryer", confidence: 0.5, allergens: ["wheat"], note: "Chips and breaded items share oil." },
  ],
  bakery: [
    { factType: "bakery_cross_contact", confidence: 0.85, allergens: ["wheat", "tree-nut", "egg", "milk", "sesame"], note: "Bakeries cross-contact flour, nuts, egg wash, and dairy across all surfaces." },
    { factType: "flour_dusting", confidence: 0.85, allergens: ["wheat"], note: "Open flour use blankets the entire kitchen." },
  ],
};

export function cuisineFacts(cuisine: string | null | undefined): PracticeFact[] {
  if (!cuisine) return [];
  const key = cuisine.toLowerCase();
  const list = DEFAULTS[key];
  if (!list) return [];
  return list.map((d) => ({
    scopeKind: "cuisine",
    scopeValue: key,
    factType: d.factType,
    confidence: d.confidence,
    source: "cuisine_default",
    sourceSnippet: d.note,
    allergens: d.allergens,
  }));
}

export const KNOWN_CUISINES = Object.keys(DEFAULTS);
