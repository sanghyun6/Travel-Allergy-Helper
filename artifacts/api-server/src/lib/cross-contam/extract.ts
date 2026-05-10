/**
 * Use Gemini to extract typed kitchen-practice facts from free text
 * (menu disclaimers, pasted reviews, kitchen notes). Returns normalized
 * facts ready to persist in the practice_facts table.
 */
import { ai } from "@workspace/integrations-gemini-ai";
import type { FactType, PracticeFact, FactSource } from "./types";

const VALID_TYPES: FactType[] = [
  "shared_fryer",
  "shared_grill",
  "shared_wok",
  "flour_dusting",
  "shared_utensils_raw",
  "bakery_cross_contact",
  "peanut_oil_use",
  "may_contain_traces",
  "dedicated_fryer",
  "nut_free_kitchen",
  "gluten_free_kitchen",
];

const VALID_ALLERGENS = new Set([
  "peanut", "tree-nut", "milk", "egg", "wheat", "soy",
  "fish", "shellfish", "sesame", "mustard", "sulphite", "celery",
]);

type RawFact = {
  factType?: string;
  confidence?: number;
  allergens?: string[];
  sourceSnippet?: string;
};

export async function extractFactsFromText(
  text: string,
  scope: { kind: "cuisine" | "restaurant"; value: string },
  source: FactSource,
): Promise<PracticeFact[]> {
  if (!text || !text.trim()) return [];
  const trimmed = text.slice(0, 4000);

  const prompt = `You are a food-safety analyst extracting kitchen-practice facts from free text.

TEXT (menu disclaimer or review snippet):
"""
${trimmed}
"""

Extract ONLY facts that the text genuinely supports. Each fact has:
- factType: one of ${VALID_TYPES.join(", ")}
- confidence: 0..1 (how strongly the text supports the fact)
- allergens: subset of [peanut, tree-nut, milk, egg, wheat, soy, fish, shellfish, sesame, mustard, sulphite, celery] that the fact is about
- sourceSnippet: the verbatim phrase (≤120 chars) from the text that the fact comes from

Examples:
- "All fried items share oil with breaded shrimp" → {factType:"shared_fryer", confidence:0.95, allergens:["shellfish","wheat"], sourceSnippet:"All fried items share oil with breaded shrimp"}
- "may contain traces of nuts" → {factType:"may_contain_traces", confidence:0.9, allergens:["tree-nut","peanut"], sourceSnippet:"may contain traces of nuts"}
- "We use peanut oil exclusively" → {factType:"peanut_oil_use", confidence:1, allergens:["peanut"], sourceSnippet:"We use peanut oil exclusively"}
- "Dedicated gluten-free fryer" → {factType:"dedicated_fryer", confidence:1, allergens:["wheat"], sourceSnippet:"Dedicated gluten-free fryer"}

Return ONLY valid JSON: {"facts":[...]} (empty array if none).`;

  let parsed: { facts?: RawFact[] } = {};
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    parsed = JSON.parse(response.text ?? "{}");
  } catch (err) {
    console.error("[cross-contam] fact extraction failed", err);
    return [];
  }

  const out: PracticeFact[] = [];
  for (const f of parsed.facts ?? []) {
    if (!f.factType || !VALID_TYPES.includes(f.factType as FactType)) continue;
    const allergens = Array.isArray(f.allergens)
      ? f.allergens.filter((a): a is string => typeof a === "string" && VALID_ALLERGENS.has(a))
      : [];
    const conf = typeof f.confidence === "number"
      ? Math.max(0, Math.min(1, f.confidence))
      : 0.6;
    out.push({
      scopeKind: scope.kind,
      scopeValue: scope.value,
      factType: f.factType as FactType,
      confidence: conf,
      source,
      sourceSnippet: typeof f.sourceSnippet === "string"
        ? f.sourceSnippet.slice(0, 240)
        : trimmed.slice(0, 240),
      allergens,
    });
  }
  return out;
}
