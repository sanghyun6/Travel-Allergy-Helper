/**
 * Tiny precision/recall harness for the ingredient knowledge graph.
 *
 * Each fixture is a free-text menu ingredient string + the set of allergen
 * slugs we expect the graph to surface for it (via direct tag OR derivation
 * chain). We run them through the same `buildCitationChains` helper the API
 * server uses so the eval reflects production behaviour.
 *
 * Run: pnpm tsx scripts/eval-knowledge-graph.ts
 */
import { buildCitationChains } from "../src/lib/ingredient-graph";
import { pool } from "@workspace/db";

type Fixture = { input: string; expect: string[]; note?: string };

const ALL = ["peanut","tree-nut","milk","egg","wheat","soy","fish","shellfish","sesame","mustard","sulphite","celery"];

const fixtures: Fixture[] = [
  // SE Asian fish-sauce family
  { input: "nam pla",            expect: ["fish"], note: "Thai fish sauce" },
  { input: "น้ำปลา",              expect: ["fish"], note: "Thai script" },
  { input: "nuoc mam",           expect: ["fish"], note: "Vietnamese" },
  { input: "魚露",                expect: ["fish"], note: "Chinese" },
  { input: "fish sauce",         expect: ["fish"] },
  // Worcestershire
  { input: "worcestershire sauce",expect: ["fish"] },
  { input: "ウスターソース",       expect: ["fish"], note: "Japanese" },
  // Oyster sauce → shellfish
  { input: "oyster sauce",       expect: ["shellfish"] },
  { input: "蚝油",                expect: ["shellfish"] },
  { input: "dầu hào",            expect: ["shellfish"] },
  // Shrimp paste
  { input: "kapi",               expect: ["shellfish"] },
  { input: "belacan",            expect: ["shellfish"] },
  { input: "terasi",             expect: ["shellfish"] },
  // Soy
  { input: "soy sauce",          expect: ["soy","wheat"] },
  { input: "shoyu",              expect: ["soy","wheat"] },
  { input: "tamari",             expect: ["soy"] },
  { input: "miso",               expect: ["soy"] },
  { input: "natto",              expect: ["soy"] },
  { input: "doenjang",           expect: ["soy"] },
  { input: "edamame",            expect: ["soy"] },
  // Sesame / nuts
  { input: "tahini",             expect: ["sesame"] },
  { input: "marzipan",           expect: ["tree-nut"] },
  { input: "satay sauce",        expect: ["peanut"] },
  // Dairy
  { input: "ghee",               expect: ["milk"] },
  { input: "paneer",             expect: ["milk"] },
  // Wheat
  { input: "udon",               expect: ["wheat"] },
  { input: "panko",              expect: ["wheat"] },
  { input: "seitan",             expect: ["wheat"] },
  // Dishes — should resolve via derivation chain
  { input: "Pad See Ew",         expect: ["soy","shellfish"] },
  { input: "Pad Thai",           expect: ["fish","peanut","shellfish","egg"] },
  { input: "Tom Yum",            expect: ["fish","shellfish"] },
];

async function main() {
  let tp = 0, fp = 0, fn = 0;
  let perfect = 0;

  console.log(`Running ${fixtures.length} fixtures…\n`);
  for (const fx of fixtures) {
    const chains = await buildCitationChains([fx.input], ALL);
    const got = new Set(chains.map((c) => c.allergen.slug));
    const want = new Set(fx.expect);

    const correct  = [...want].filter((s) => got.has(s));
    const missed   = [...want].filter((s) => !got.has(s));
    const spurious = [...got].filter((s) => !want.has(s));

    tp += correct.length;
    fn += missed.length;
    fp += spurious.length;

    const ok = missed.length === 0;
    if (ok) perfect++;

    const status = ok ? "✓" : "✗";
    const noteStr = fx.note ? ` (${fx.note})` : "";
    console.log(
      `${status} "${fx.input}"${noteStr}\n` +
        `    expected: [${[...want].join(", ")}]\n` +
        `    got:      [${[...got].join(", ")}]` +
        (missed.length ? `\n    missed:   [${missed.join(", ")}]` : "") +
        (spurious.length ? `\n    extra:    [${spurious.join(", ")}]` : ""),
    );
  }

  const precision = tp / Math.max(1, tp + fp);
  const recall    = tp / Math.max(1, tp + fn);
  const f1        = (2 * precision * recall) / Math.max(1e-9, precision + recall);
  console.log(
    `\nFixtures: ${perfect}/${fixtures.length} fully correct ` +
      `· precision=${precision.toFixed(3)} ` +
      `recall=${recall.toFixed(3)} ` +
      `f1=${f1.toFixed(3)} ` +
      `(tp=${tp} fp=${fp} fn=${fn})`,
  );

  await pool.end();
  // Non-zero exit if recall drops below threshold so this can wire into CI later.
  if (recall < 0.85) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
