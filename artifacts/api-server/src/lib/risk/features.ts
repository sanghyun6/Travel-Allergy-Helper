/**
 * Feature extraction for the personalized risk model.
 *
 * Turns a dish (name + ingredients + cuisine + allergen flags) into a
 * fixed-length numeric vector. Same builder is used for both training and
 * inference so the schemas stay aligned. Feature names are exposed so the
 * insights screen can show top drivers per user.
 */

const ALLERGENS = [
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

const CUISINES = [
  "thai",
  "chinese",
  "japanese",
  "korean",
  "vietnamese",
  "indonesian",
  "indian",
  "italian",
  "french",
  "spanish",
  "mexican",
  "middle-eastern",
  "american",
  "other",
] as const;

const HIGH_RISK_DERIVATIVES = [
  "fish-sauce",
  "oyster-sauce",
  "soy-sauce",
  "peanut-oil",
  "sesame-oil",
  "ghee",
  "anchovy",
  "shrimp-paste",
  "worcestershire",
] as const;

export type RawDish = {
  name: string;
  translatedName?: string;
  description?: string;
  cuisine?: string | null;
  ingredients: string[];
  allergenFlags: { name: string; severity: string }[];
  conflictingRestrictions?: string[];
  citations?: { allergen?: { slug?: string } }[];
};

export const FEATURE_NAMES: string[] = (() => {
  const names: string[] = [];
  // 8-dim ingredient embedding (averaged hashed n-grams projected down)
  for (let i = 0; i < 8; i++) names.push(`ing_emb_${i}`);
  for (const a of ALLERGENS) names.push(`allergen_${a}`);
  for (const a of ALLERGENS) names.push(`citation_${a}`);
  for (const c of CUISINES) names.push(`cuisine_${c}`);
  for (const d of HIGH_RISK_DERIVATIVES) names.push(`deriv_${d}`);
  names.push("ingredient_count");
  names.push("conflicting_count");
  names.push("severity_high_count");
  names.push("severity_medium_count");
  return names;
})();

export const FEATURE_DIM = FEATURE_NAMES.length;

function hashStr(s: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function ingredientEmbedding(tokens: string[]): number[] {
  // Tiny 8-dim hashed bag-of-tokens embedding (deterministic, no API).
  const v = new Array(8).fill(0) as number[];
  if (tokens.length === 0) return v;
  for (const tok of tokens) {
    const t = tok.toLowerCase().normalize("NFKC");
    for (let seed = 0; seed < 8; seed++) {
      const h = hashStr(t, seed);
      const sign = (h & 1) === 0 ? 1 : -1;
      v[seed] += sign * (((h >>> 1) % 1000) / 1000);
    }
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function detectCuisine(dish: RawDish): string {
  const text = [
    dish.cuisine ?? "",
    dish.name,
    dish.translatedName ?? "",
    dish.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (/(thai|pad |tom yum|som tam)/.test(text)) return "thai";
  if (/(chinese|szechuan|sichuan|cantonese|dim sum|kung pao|mapo)/.test(text)) return "chinese";
  if (/(japanese|sushi|ramen|tempura|udon|miso|teriyaki|donburi)/.test(text)) return "japanese";
  if (/(korean|kimchi|bibimbap|bulgogi|gochujang)/.test(text)) return "korean";
  if (/(vietnam|pho|banh|nuoc cham)/.test(text)) return "vietnamese";
  if (/(indonesian|nasi|rendang|sambal|satay)/.test(text)) return "indonesian";
  if (/(indian|curry|tikka|masala|naan|biryani|paneer)/.test(text)) return "indian";
  if (/(italian|pizza|pasta|risotto|gnocchi|carbonara|pesto)/.test(text)) return "italian";
  if (/(french|baguette|coq au vin|ratatouille|crepe|crème)/.test(text)) return "french";
  if (/(spanish|tapas|paella|jamón|chorizo)/.test(text)) return "spanish";
  if (/(mexican|taco|burrito|enchilada|salsa|guacamole|quesadilla)/.test(text)) return "mexican";
  if (/(hummus|falafel|tabbouleh|shawarma|kebab|baklava)/.test(text)) return "middle-eastern";
  if (/(burger|hot dog|bbq|mac and cheese|wings)/.test(text)) return "american";
  return "other";
}

function allergenSlugFromName(name: string): string | null {
  const s = name.toLowerCase();
  if (/peanut/.test(s)) return "peanut";
  if (/(tree.?nut|almond|cashew|hazelnut|walnut|pecan|pistachio)/.test(s)) return "tree-nut";
  if (/(milk|dairy|lactose|cheese|butter|cream)/.test(s)) return "milk";
  if (/egg/.test(s)) return "egg";
  if (/(wheat|gluten)/.test(s)) return "wheat";
  if (/soy/.test(s)) return "soy";
  if (/(shellfish|shrimp|prawn|crab|lobster|oyster|clam|mussel|scallop|squid|calamari)/.test(s))
    return "shellfish";
  if (/fish/.test(s)) return "fish";
  if (/sesame/.test(s)) return "sesame";
  if (/mustard/.test(s)) return "mustard";
  if (/sulphite|sulfite/.test(s)) return "sulphite";
  if (/celery/.test(s)) return "celery";
  return null;
}

function detectDerivatives(dish: RawDish): Set<string> {
  const text = [
    dish.name,
    dish.translatedName ?? "",
    dish.description ?? "",
    ...dish.ingredients,
  ]
    .join(" | ")
    .toLowerCase();
  const set = new Set<string>();
  if (/fish sauce|nam pla|nuoc mam|魚露/.test(text)) set.add("fish-sauce");
  if (/oyster sauce|蠔油/.test(text)) set.add("oyster-sauce");
  if (/soy sauce|shoyu|醤油|간장/.test(text)) set.add("soy-sauce");
  if (/peanut oil|groundnut oil/.test(text)) set.add("peanut-oil");
  if (/sesame oil|麻油/.test(text)) set.add("sesame-oil");
  if (/ghee/.test(text)) set.add("ghee");
  if (/anchov/.test(text)) set.add("anchovy");
  if (/shrimp paste|belacan|kapi/.test(text)) set.add("shrimp-paste");
  if (/worcestershire/.test(text)) set.add("worcestershire");
  return set;
}

export function buildFeatures(dish: RawDish): {
  vector: number[];
  meta: { cuisine: string; derivatives: string[]; allergenSlugs: string[] };
} {
  const v = new Array(FEATURE_DIM).fill(0) as number[];
  let idx = 0;

  const ingTokens = [dish.name, ...(dish.ingredients ?? [])];
  const emb = ingredientEmbedding(ingTokens);
  for (let i = 0; i < 8; i++) v[idx++] = emb[i];

  const flagSlugs = new Set<string>();
  let highCount = 0;
  let medCount = 0;
  for (const f of dish.allergenFlags ?? []) {
    const slug = allergenSlugFromName(f.name);
    if (slug) flagSlugs.add(slug);
    if (f.severity === "high") highCount++;
    else if (f.severity === "medium") medCount++;
  }
  for (const a of ALLERGENS) {
    v[idx++] = flagSlugs.has(a) ? 1 : 0;
  }

  const citationSlugs = new Set<string>();
  for (const c of dish.citations ?? []) {
    if (c?.allergen?.slug) citationSlugs.add(c.allergen.slug);
  }
  for (const a of ALLERGENS) {
    v[idx++] = citationSlugs.has(a) ? 1 : 0;
  }

  const cuisine = detectCuisine(dish);
  for (const c of CUISINES) {
    v[idx++] = c === cuisine ? 1 : 0;
  }

  const derivs = detectDerivatives(dish);
  for (const d of HIGH_RISK_DERIVATIVES) {
    v[idx++] = derivs.has(d) ? 1 : 0;
  }

  v[idx++] = Math.min(1, (dish.ingredients?.length ?? 0) / 10);
  v[idx++] = Math.min(1, (dish.conflictingRestrictions?.length ?? 0) / 5);
  v[idx++] = Math.min(1, highCount / 4);
  v[idx++] = Math.min(1, medCount / 4);

  const allergenSlugs = [
    ...new Set([...flagSlugs, ...citationSlugs]),
  ];
  return { vector: v, meta: { cuisine, derivatives: [...derivs], allergenSlugs } };
}
