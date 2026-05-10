/**
 * Forward-chaining resolver: combines facts (cuisine defaults + restaurant +
 * extracted) with the rule library to produce per-dish risk + an explainable
 * trace.
 *
 * Calibration: severity is downscaled by fact confidence. We deliberately
 * return "unknown" when no rule fires AND no relevant facts exist for any
 * of the user's allergens — the spec calls out that missing-evidence cases
 * should not silently default to "safe".
 */
import { RULES, SUPPRESSORS } from "./rules";
import type {
  CrossContamResult,
  DishContext,
  FiredRule,
  PracticeFact,
  RiskLevel,
} from "./types";

const SEVERITY_RANK: Record<Exclude<RiskLevel, "unknown">, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function downscale(
  severity: Exclude<RiskLevel, "unknown">,
  confidence: number,
): Exclude<RiskLevel, "unknown"> {
  // Below 0.4 confidence, drop one level. Below 0.2, two levels. Floor at "low".
  if (confidence >= 0.6) return severity;
  if (confidence >= 0.35) {
    if (severity === "high") return "medium";
    return severity;
  }
  return "low";
}

function categoriesFor(dish: {
  name: string;
  translatedName?: string;
  description?: string;
  ingredients?: string[];
}): Set<string> {
  const text = [
    dish.name,
    dish.translatedName ?? "",
    dish.description ?? "",
    ...(dish.ingredients ?? []),
  ]
    .join(" | ")
    .toLowerCase();
  const cats = new Set<string>();
  if (/(fried|fritter|tempura|karaage|fries|chips|katsu|donut|crisp|crispy|deep[- ]fried)/.test(text))
    cats.add("fried");
  if (/(grill|grilled|yakitori|bbq|barbecue|charred|robata|skewer|kebab)/.test(text))
    cats.add("grilled");
  if (/(stir[- ]fr|wok|kung pao|mapo|pad |lo mein|chow mein|gan bian)/.test(text))
    cats.add("stir_fried");
  if (/(sushi|sashimi|nigiri|tartare|crudo|ceviche|raw)/.test(text))
    cats.add("raw");
  if (/(bread|baguette|pastry|pasty|croissant|cake|cookie|bun|brioche|tart|pie|scone|donut|muffin|focaccia|pizza dough)/.test(text))
    cats.add("bakery");
  if (/(panko|breaded|battered|crumb|katsu|tempura|schnitzel|milanesa)/.test(text))
    cats.add("breaded");
  if (/(pasta|noodle|udon|ramen|soba|spaghetti|linguine|fettuccine|gnocchi)/.test(text))
    cats.add("pasta");
  if (/(sauce|gravy|aioli|mayo|dressing)/.test(text))
    cats.add("sauced");
  return cats;
}

export function dishContext(dish: {
  name: string;
  translatedName?: string;
  description?: string;
  ingredients?: string[];
}): DishContext {
  return {
    name: dish.name,
    translatedName: dish.translatedName,
    description: dish.description,
    ingredients: dish.ingredients ?? [],
    categories: categoriesFor(dish),
  };
}

export function evaluateDish(
  dish: { name: string; translatedName?: string; description?: string; ingredients?: string[] },
  allergens: string[],
  facts: PracticeFact[],
): CrossContamResult {
  const ctx = dishContext(dish);
  const fired: FiredRule[] = [];
  const userAllergens = new Set(allergens.map((a) => a.toLowerCase()));

  // Build allergen × factType suppression set from suppressing facts in scope.
  const suppressed = new Set<string>(); // key: `${allergen}|${factType}`
  for (const f of facts) {
    const sup = SUPPRESSORS[f.factType];
    if (!sup) continue;
    for (const a of userAllergens) {
      if (!sup.affects(a)) continue;
      for (const ft of sup.suppresses) suppressed.add(`${a}|${ft}`);
    }
  }

  for (const rule of RULES) {
    const matchingFacts = facts.filter((f) => f.factType === rule.factType);
    if (matchingFacts.length === 0) continue;
    if (!rule.appliesTo(ctx)) continue;

    for (const fact of matchingFacts) {
      for (const allergen of userAllergens) {
        if (!rule.affects(allergen, fact.allergens)) continue;
        if (suppressed.has(`${allergen}|${fact.factType}`)) continue;
        const sev = downscale(rule.severity, fact.confidence);
        fired.push({
          ruleId: rule.id,
          description: rule.description,
          severity: sev,
          allergen,
          fact,
          explanation: rule.explain(ctx, fact, allergen),
        });
      }
    }
  }

  // Aggregate risk.
  let topRank = 0;
  let topLevel: Exclude<RiskLevel, "unknown"> | null = null;
  for (const f of fired) {
    const r = SEVERITY_RANK[f.severity];
    if (r > topRank) {
      topRank = r;
      topLevel = f.severity;
    }
  }

  // Detect unknown allergens: no fired rule and no fact even references them
  // (or no facts at all in scope). Cuisines with no facts → unknown.
  const evaluatedAllergens = new Set(fired.map((f) => f.allergen));
  const unknownAllergens: string[] = [];
  if (facts.length === 0) {
    unknownAllergens.push(...userAllergens);
  } else {
    for (const a of userAllergens) {
      if (evaluatedAllergens.has(a)) continue;
      const referenced = facts.some(
        (f) => (f.allergens ?? []).includes(a),
      );
      if (!referenced) unknownAllergens.push(a);
    }
  }

  let risk: RiskLevel;
  if (topLevel) {
    risk = topLevel;
  } else if (unknownAllergens.length > 0) {
    // Any user allergen lacking evidence → return unknown rather than
    // silently defaulting to low (calibration: never give false reassurance
    // when we have no evidence one way or the other).
    risk = "unknown";
  } else {
    risk = "low";
  }

  return {
    risk,
    fired,
    consideredFacts: facts,
    unknownAllergens,
  };
}
