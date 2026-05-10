/**
 * Eval harness for the cross-contamination reasoner. Each fixture provides:
 *   - dish description
 *   - user allergens
 *   - facts in scope (cuisine defaults + restaurant + extracted)
 *   - expected risk band
 *
 * Run: pnpm tsx scripts/eval-cross-contamination.ts
 */
import { evaluateDish, cuisineFacts } from "../src/lib/cross-contam";
import type { PracticeFact, RiskLevel } from "../src/lib/cross-contam/types";

type Fixture = {
  name: string;
  dish: { name: string; description?: string };
  allergens: string[];
  cuisine?: string;
  extra?: PracticeFact[];
  expect: RiskLevel;
  // Required rule IDs that MUST appear in the fired set. Acts as a
  // regression guard so rule logic changes are caught even if the final
  // risk band happens to land on the same level.
  expectRules?: string[];
};

const restaurantFact = (
  factType: PracticeFact["factType"],
  allergens: string[],
  source: PracticeFact["source"] = "menu_disclaimer",
  confidence = 0.9,
): PracticeFact => ({
  scopeKind: "restaurant",
  scopeValue: "test-restaurant",
  factType,
  confidence,
  source,
  sourceSnippet: "test fixture",
  allergens,
});

const fixtures: Fixture[] = [
  {
    name: "Tempura at a sushi bar with shellfish allergy",
    dish: { name: "Vegetable Tempura", description: "Lightly battered seasonal vegetables, deep fried" },
    allergens: ["shellfish"],
    cuisine: "japanese",
    expect: "high",
    expectRules: ["shared_fryer_high"],
  },
  {
    name: "Pad Thai at a Thai place with shellfish allergy",
    dish: { name: "Pad See Ew", description: "Stir-fried wide rice noodles" },
    allergens: ["shellfish"],
    cuisine: "thai",
    expect: "medium",
    expectRules: ["shared_wok_med"],
  },
  {
    name: "Plain rice at a Chinese restaurant — shared wok still fires",
    dish: { name: "Steamed white rice", description: "Plain rice" },
    allergens: ["peanut"],
    cuisine: "chinese",
    expect: "medium",
    expectRules: ["shared_wok_med"],
  },
  {
    name: "Bakery croissant for tree-nut allergy",
    dish: { name: "Almond Croissant", description: "Buttery laminated pastry with sliced almonds" },
    allergens: ["tree-nut"],
    cuisine: "bakery",
    expect: "high",
    expectRules: ["bakery_cross_contact_high"],
  },
  {
    name: "Italian pasta dish for wheat allergy (flour dusting)",
    dish: { name: "Spaghetti Pomodoro", description: "Hand-rolled spaghetti with tomato" },
    allergens: ["wheat"],
    cuisine: "italian",
    expect: "high",
    expectRules: ["flour_dusting_high"],
  },
  {
    name: "Dedicated GF fryer suppresses shared_fryer for wheat",
    dish: { name: "French Fries", description: "Hand-cut fries, deep fried" },
    allergens: ["wheat"],
    cuisine: "american",
    extra: [
      restaurantFact("dedicated_fryer", [], "menu_disclaimer", 1),
      restaurantFact("gluten_free_kitchen", [], "menu_disclaimer", 1),
    ],
    expect: "low",
    expectRules: [],
  },
  {
    name: "Peanut oil disclosure → high for peanut allergy regardless of dish",
    dish: { name: "Mu Shu Pork", description: "Pork stir fried with vegetables" },
    allergens: ["peanut"],
    cuisine: "chinese",
    extra: [restaurantFact("peanut_oil_use", ["peanut"], "menu_disclaimer", 1)],
    expect: "high",
    expectRules: ["peanut_oil_high"],
  },
  {
    name: "May-contain-traces nuts disclaimer for tree-nut allergy",
    dish: { name: "Chocolate Mousse", description: "Dark chocolate dessert" },
    allergens: ["tree-nut"],
    cuisine: "french",
    extra: [restaurantFact("may_contain_traces", ["tree-nut", "peanut"], "menu_disclaimer", 0.9)],
    expect: "medium",
    expectRules: ["may_contain_traces_med"],
  },
  {
    name: "Unknown — no facts and unknown cuisine",
    dish: { name: "Generic Sandwich", description: "Bread, lettuce, tomato" },
    allergens: ["sesame"],
    cuisine: "unknownland",
    expect: "unknown",
    expectRules: [],
  },
  {
    name: "Sashimi for fish allergy at sushi place",
    dish: { name: "Salmon Sashimi", description: "Raw salmon, sliced" },
    allergens: ["fish"],
    cuisine: "japanese",
    expect: "medium",
    expectRules: ["shared_utensils_raw_med"],
  },
  {
    name: "Korean BBQ for shellfish allergy",
    dish: { name: "Bulgogi", description: "Grilled marinated beef" },
    allergens: ["shellfish"],
    cuisine: "korean",
    expect: "medium",
    expectRules: ["shared_grill_med"],
  },
  {
    name: "Nut-free kitchen suppresses cuisine bakery cross-contact for tree-nut",
    dish: { name: "Plain Croissant", description: "Buttery laminated pastry" },
    allergens: ["tree-nut"],
    cuisine: "bakery",
    extra: [restaurantFact("nut_free_kitchen", [], "menu_disclaimer", 1)],
    expect: "low",
    expectRules: [],
  },
  {
    name: "Indonesian peanut sauce defaults",
    dish: { name: "Gado-Gado", description: "Vegetable salad" },
    allergens: ["peanut"],
    cuisine: "indonesian",
    expect: "medium",
    expectRules: ["may_contain_traces_med"],
  },
  {
    name: "User has no relevant allergen for cuisine facts → unknown for sesame",
    dish: { name: "Pho Bo", description: "Beef noodle soup" },
    allergens: ["sesame"],
    cuisine: "vietnamese",
    expect: "unknown",
    expectRules: [],
  },
  // ── Additional fixtures (15-20) for broader coverage ──
  {
    name: "Indian pakora fryer for wheat allergy (cuisine-default downscales to medium)",
    dish: { name: "Vegetable Pakora", description: "Chickpea-battered fried vegetables" },
    allergens: ["wheat"],
    cuisine: "indian",
    expect: "medium",
    expectRules: ["shared_fryer_high"],
  },
  {
    name: "Vietnamese pho for fish allergy (fish sauce traces)",
    dish: { name: "Pho Ga", description: "Chicken noodle soup" },
    allergens: ["fish"],
    cuisine: "vietnamese",
    expect: "medium",
    expectRules: ["may_contain_traces_med"],
  },
  {
    name: "American diner with no relevant allergen → low",
    dish: { name: "Garden Salad", description: "Mixed greens with vinaigrette" },
    allergens: ["sesame"],
    cuisine: "american",
    expect: "unknown",
    expectRules: [],
  },
  {
    name: "Mexican fryer + wheat allergy (cuisine-default downscales to medium)",
    dish: { name: "Tortilla Chips", description: "Deep-fried corn tortilla triangles" },
    allergens: ["wheat"],
    cuisine: "mexican",
    expect: "medium",
    expectRules: ["shared_fryer_high"],
  },
  {
    name: "French patisserie egg allergy",
    dish: { name: "Pain au Chocolat", description: "Chocolate-filled pastry" },
    allergens: ["egg"],
    cuisine: "french",
    expect: "medium",
    expectRules: ["bakery_cross_contact_high"],
  },
  {
    name: "Disclaimer-only restaurant fact: shared_fryer overrides cuisine baseline",
    dish: { name: "Onion Rings", description: "Battered and deep fried" },
    allergens: ["shellfish"],
    cuisine: "american",
    extra: [restaurantFact("shared_fryer", ["shellfish", "fish"], "menu_disclaimer", 1)],
    expect: "high",
    expectRules: ["shared_fryer_high"],
  },
];

function buildScope(fx: Fixture): PracticeFact[] {
  return [...cuisineFacts(fx.cuisine ?? null), ...(fx.extra ?? [])];
}

async function main() {
  let pass = 0;
  let fail = 0;
  console.log(`Running ${fixtures.length} cross-contamination fixtures…\n`);
  for (const fx of fixtures) {
    const facts = buildScope(fx);
    const result = evaluateDish(fx.dish, fx.allergens, facts);
    const firedIds = new Set(result.fired.map((f) => f.ruleId));
    const riskOk = result.risk === fx.expect;
    const expectedRules = fx.expectRules ?? [];
    const missingRules = expectedRules.filter((r) => !firedIds.has(r));
    const rulesOk = missingRules.length === 0;
    const ok = riskOk && rulesOk;
    if (ok) pass++;
    else fail++;
    const tag = ok ? "PASS" : "FAIL";
    const firedSummary = result.fired.length === 0
      ? "(none)"
      : result.fired.map((f) => `${f.ruleId}/${f.allergen}`).join(", ");
    console.log(
      `[${tag}] ${fx.name}\n  expected=${fx.expect}  got=${result.risk}  fired=[${firedSummary}]` +
        (riskOk ? "" : `\n  ✗ risk band mismatch`) +
        (rulesOk ? "" : `\n  ✗ missing required rules: ${missingRules.join(", ")}`),
    );
  }
  console.log(`\nResult: ${pass}/${fixtures.length} passed (${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
