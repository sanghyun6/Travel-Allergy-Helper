/**
 * One-shot CLI entry to (re-)seed the ingredient knowledge graph.
 * The actual logic lives in `src/lib/ingredient-graph/seed.ts` so the API
 * server can also call it from its bootstrap path.
 *
 * Run: pnpm tsx scripts/seed-knowledge-graph.ts
 */
import { pool } from "@workspace/db";
import { seedKnowledgeGraph } from "../src/lib/ingredient-graph/seed";

async function main() {
  const result = await seedKnowledgeGraph();
  console.log(
    `✓ Seed complete. ingredients=${result.ingredients} ` +
      `aliases=${result.aliases} derivations=${result.derivations} ` +
      `(+${result.externalAliasesAdded} external aliases, ${result.usdaAttached} USDA hits)`,
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
