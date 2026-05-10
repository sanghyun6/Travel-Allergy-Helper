/**
 * Alias-aware allergen matching. Mirrors the server's normalizeAllergen
 * map (artifacts/api-server/src/lib/cross-contam/allergens.ts) so the
 * camera detail sheet groups chips into "Affects you" vs "Also contains"
 * using the same canonical slugs the server uses to compute safetyLevel.
 *
 * Keep in sync with the server map. Limited to the user-facing alias set
 * needed for chip matching — not the full graph.
 */
const ALIASES: Record<string, string> = {
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

export function normalizeAllergen(input: string): string | null {
  if (!input) return null;
  const key = input.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[key] ?? null;
}

export function buildUserAllergenSet(restrictions: string[]): Set<string> {
  const out = new Set<string>();
  for (const r of restrictions) {
    const slug = normalizeAllergen(r);
    if (slug) out.add(slug);
  }
  return out;
}
