/**
 * Declarative rule library for the cross-contamination reasoner.
 *
 * Each rule is a pure function over (dish context, user allergen, fact). Rules
 * fire when the fact's type matches, the dish category matches, and the user
 * actually has the affected allergen. Severity is fixed per rule but downscaled
 * by fact confidence in the engine.
 *
 * Add a new rule by appending to RULES — no other code changes required.
 */
import type { DishContext, PracticeFact, FiredRule } from "./types";

type RuleDef = {
  id: string;
  factType: PracticeFact["factType"];
  description: string;
  severity: FiredRule["severity"];
  appliesTo: (ctx: DishContext) => boolean;
  affects: (allergen: string, factAllergens: string[] | undefined) => boolean;
  explain: (ctx: DishContext, fact: PracticeFact, allergen: string) => string;
};

const isFried = (c: DishContext) => c.categories.has("fried");
const isGrilled = (c: DishContext) => c.categories.has("grilled");
const isWokked = (c: DishContext) => c.categories.has("stir_fried") || c.categories.has("wok");
const isRaw = (c: DishContext) => c.categories.has("raw");
const isBakery = (c: DishContext) => c.categories.has("bakery");
const isBreaded = (c: DishContext) => c.categories.has("breaded") || c.categories.has("battered");
const isAnyDish = (_c: DishContext) => true;

const intersects = (a: string, factAllergens: string[] | undefined) =>
  !!factAllergens && factAllergens.includes(a);

export const RULES: RuleDef[] = [
  {
    id: "shared_fryer_high",
    factType: "shared_fryer",
    description: "Shared fryer oil contaminates fried items",
    severity: "high",
    appliesTo: (c) => isFried(c) || isBreaded(c),
    affects: intersects,
    explain: (_c, _f, a) =>
      `This kitchen uses a shared fryer; any fried/battered item likely carries traces of ${a}.`,
  },
  {
    id: "shared_grill_med",
    factType: "shared_grill",
    description: "Shared grill surface transfers proteins",
    severity: "medium",
    appliesTo: (c) => isGrilled(c),
    affects: intersects,
    explain: (_c, _f, a) =>
      `Grilled items share the surface used for ${a}-containing proteins.`,
  },
  {
    id: "shared_wok_med",
    factType: "shared_wok",
    description: "Wok station carries residue across dishes",
    severity: "medium",
    appliesTo: (c) => isWokked(c) || isAnyDish(c) /* most dishes hit a wok in these cuisines */,
    affects: intersects,
    explain: (_c, _f, a) =>
      `The wok used for this dish previously cooked ${a}-containing items in the same shift.`,
  },
  {
    id: "flour_dusting_high",
    factType: "flour_dusting",
    description: "Open flour blankets surfaces",
    severity: "high",
    appliesTo: (c) => isBakery(c) || isBreaded(c) || c.categories.has("pasta"),
    affects: (a, fa) => intersects(a, fa) || a === "wheat",
    explain: (_c, _f, a) =>
      `Flour dusting is reported here, so even nominally ${a}-free items pick up airborne flour.`,
  },
  {
    id: "shared_utensils_raw_med",
    factType: "shared_utensils_raw",
    description: "Knives/boards shared across raw proteins",
    severity: "medium",
    appliesTo: (c) => isRaw(c),
    affects: intersects,
    explain: (_c, _f, a) =>
      `Sushi/sashimi knives and boards here are shared across ${a}-containing proteins.`,
  },
  {
    id: "bakery_cross_contact_high",
    factType: "bakery_cross_contact",
    description: "Bakery cross-contact across pastries",
    severity: "high",
    appliesTo: (c) => isBakery(c),
    affects: intersects,
    explain: (_c, _f, a) =>
      `Bakery cross-contact is reported; ${a} from other pastries can reach this item.`,
  },
  {
    id: "peanut_oil_high",
    factType: "peanut_oil_use",
    description: "Peanut oil in cooking",
    severity: "high",
    appliesTo: (_c) => true,
    affects: (a) => a === "peanut",
    explain: (_c, _f) =>
      `This kitchen cooks with peanut oil; even non-peanut dishes carry exposure.`,
  },
  {
    id: "may_contain_traces_med",
    factType: "may_contain_traces",
    description: "Disclaimer warns of trace allergens",
    severity: "medium",
    appliesTo: (_c) => true,
    affects: intersects,
    explain: (_c, f, a) =>
      `Menu disclaimer warns of trace ${a}: "${(f.sourceSnippet ?? "may contain traces").slice(0, 120)}".`,
  },
  // ── Negative / suppressing facts (handled in the engine, not here) ──
];

// Facts that, when present, *suppress* other rules for that allergen.
type Suppressor = {
  suppresses: PracticeFact["factType"][];
  affects: (a: string) => boolean;
};

export const SUPPRESSORS: Partial<Record<PracticeFact["factType"], Suppressor>> = {
  dedicated_fryer: {
    suppresses: ["shared_fryer"],
    affects: () => true,
  },
  nut_free_kitchen: {
    suppresses: ["shared_fryer", "shared_wok", "shared_grill", "may_contain_traces", "bakery_cross_contact"],
    affects: (a: string) => a === "peanut" || a === "tree-nut",
  },
  gluten_free_kitchen: {
    suppresses: ["flour_dusting", "shared_fryer", "may_contain_traces"],
    affects: (a: string) => a === "wheat",
  },
};
