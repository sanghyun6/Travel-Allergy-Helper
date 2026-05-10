/**
 * Canonical allergen tokens used by the rules engine + cuisine defaults.
 * UI labels (e.g. "Tree Nuts", "Gluten / Wheat") and free-text inputs are
 * mapped to these slugs so the rule library has a single source of truth.
 */
export const ALLERGEN_SLUGS = [
  "peanut",
  "tree-nut",
  "milk",
  "egg",
  "wheat",
  "soy",
  "fish",
  "shellfish",
  "sesame",
  "mustard",
  "sulphite",
  "celery",
] as const;

export type AllergenSlug = (typeof ALLERGEN_SLUGS)[number];

const ALIASES: Record<string, AllergenSlug> = {
  peanut: "peanut",
  peanuts: "peanut",
  groundnut: "peanut",
  groundnuts: "peanut",
  "tree-nut": "tree-nut",
  "tree nut": "tree-nut",
  "tree nuts": "tree-nut",
  treenut: "tree-nut",
  treenuts: "tree-nut",
  nuts: "tree-nut",
  almond: "tree-nut",
  almonds: "tree-nut",
  cashew: "tree-nut",
  cashews: "tree-nut",
  walnut: "tree-nut",
  walnuts: "tree-nut",
  hazelnut: "tree-nut",
  hazelnuts: "tree-nut",
  pistachio: "tree-nut",
  pistachios: "tree-nut",
  pecan: "tree-nut",
  pecans: "tree-nut",
  milk: "milk",
  dairy: "milk",
  lactose: "milk",
  cheese: "milk",
  butter: "milk",
  egg: "egg",
  eggs: "egg",
  wheat: "wheat",
  gluten: "wheat",
  "gluten / wheat": "wheat",
  "gluten/wheat": "wheat",
  "gluten and wheat": "wheat",
  flour: "wheat",
  bread: "wheat",
  soy: "soy",
  soya: "soy",
  soybean: "soy",
  soybeans: "soy",
  fish: "fish",
  finfish: "fish",
  salmon: "fish",
  tuna: "fish",
  shellfish: "shellfish",
  shrimp: "shellfish",
  prawn: "shellfish",
  prawns: "shellfish",
  crab: "shellfish",
  lobster: "shellfish",
  crustacean: "shellfish",
  crustaceans: "shellfish",
  mollusk: "shellfish",
  mollusks: "shellfish",
  sesame: "sesame",
  tahini: "sesame",
  mustard: "mustard",
  sulphite: "sulphite",
  sulfite: "sulphite",
  sulphites: "sulphite",
  sulfites: "sulphite",
  celery: "celery",
};

export function normalizeAllergen(input: string): AllergenSlug | null {
  if (!input) return null;
  const key = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (ALIASES[key]) return ALIASES[key];
  // Already-canonical with hyphen
  const dashed = key.replace(/\s+/g, "-");
  if ((ALLERGEN_SLUGS as readonly string[]).includes(dashed)) {
    return dashed as AllergenSlug;
  }
  return null;
}

export function normalizeAllergenList(inputs: string[]): AllergenSlug[] {
  const out = new Set<AllergenSlug>();
  for (const i of inputs) {
    const n = normalizeAllergen(i);
    if (n) out.add(n);
  }
  return Array.from(out);
}
