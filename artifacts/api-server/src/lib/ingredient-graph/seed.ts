/**
 * Idempotent seeder for the ingredient knowledge graph.
 *
 * Sources merged on every run:
 *   - Curated YAML at `data/knowledge-graph.yaml` (canonical nodes, derivations,
 *     dish recipes — the ground truth we own).
 *   - Open Food Facts allergen taxonomy (multilingual allergen-name aliases).
 *   - USDA FoodData Central (canonical descriptions + category for each
 *     curated ingredient, attached as supplementary alias rows).
 *
 * Embeddings: see `embedding.ts`. The Replit AI Integrations proxy does not
 * currently expose Gemini embeddings (confirmed in
 * `.local/skills/ai-integrations-gemini/SKILL.md` "Unsupported Capabilities"),
 * so we use a deterministic 768-dim hashed character-n-gram TF vector. This
 * is intentional — it gives consistent multilingual fuzzy matching without
 * an external dependency. The path is encapsulated so a real embeddings
 * provider can be swapped in later without touching the schema.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { eq, sql } from "drizzle-orm";
import {
  db,
  pool,
  allergens as allergensTable,
  ingredients as ingredientsTable,
  ingredientAliases as aliasesTable,
  ingredientAllergens as ingredientAllergensTable,
  ingredientDerivations as derivationsTable,
} from "@workspace/db";
import { embedText, EMBED_DIMS } from "./embedding";
import { fetchExternalSources } from "./external";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type AliasYaml = { alias: string; language: string };
type IngredientYaml = {
  slug: string;
  name: string;
  category?: string;
  description?: string;
  source: string;
  source_url?: string;
  aliases?: AliasYaml[];
  allergens?: string[];
};

type GraphYaml = {
  allergens: { slug: string; name: string; category: string; description?: string }[];
  ingredients: IngredientYaml[];
  extra_ingredients?: IngredientYaml[];
  derivations: { parent: string; child: string; relation: string; note?: string }[];
};

function embedTexts(texts: string[]): number[][] {
  const out: number[][] = [];
  for (const t of texts) {
    const v = embedText(t);
    if (v.length !== EMBED_DIMS) {
      throw new Error(`Unexpected embedding length: got ${v.length}`);
    }
    out.push(v);
  }
  return out;
}

export type SeedResult = {
  ingredients: number;
  aliases: number;
  derivations: number;
  externalAliasesAdded: number;
  usdaAttached: number;
};

export async function seedKnowledgeGraph(opts: { skipExternal?: boolean } = {}): Promise<SeedResult> {
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");

  // seed.ts lives at src/lib/ingredient-graph/seed.ts; YAML is at <artifact>/data/.
  // Try the dev path first, then the bundled-dist path, then cwd.
  const yamlCandidates = [
    resolve(__dirname, "..", "..", "..", "..", "data", "knowledge-graph.yaml"),
    resolve(__dirname, "..", "data", "knowledge-graph.yaml"),
    resolve(process.cwd(), "data", "knowledge-graph.yaml"),
  ];
  let raw: string | null = null;
  for (const p of yamlCandidates) {
    try { raw = readFileSync(p, "utf8"); break; } catch { /* try next */ }
  }
  if (raw == null) {
    throw new Error(`knowledge-graph.yaml not found; tried: ${yamlCandidates.join(", ")}`);
  }
  const graph = parseYaml(raw) as GraphYaml;

  console.log(
    `→ Loaded ${graph.allergens.length} allergens, ${graph.ingredients.length}` +
      ` ingredients (+${graph.extra_ingredients?.length ?? 0} extra), ` +
      `${graph.derivations.length} derivations.`,
  );

  // ── 1. Allergens ────────────────────────────────────────────────────
  const allergenSlugToId = new Map<string, number>();
  for (const a of graph.allergens) {
    const [row] = await db
      .insert(allergensTable)
      .values({
        slug: a.slug,
        name: a.name,
        category: a.category,
        description: a.description ?? null,
      })
      .onConflictDoUpdate({
        target: allergensTable.slug,
        set: {
          name: a.name,
          category: a.category,
          description: a.description ?? null,
        },
      })
      .returning({ id: allergensTable.id, slug: allergensTable.slug });
    allergenSlugToId.set(row.slug, row.id);
  }

  // ── 2. Ingredients ──────────────────────────────────────────────────
  const allIngredients = [
    ...graph.ingredients,
    ...(graph.extra_ingredients ?? []),
  ];
  const ingredientTexts = allIngredients.map((ing) => {
    const aliasText = (ing.aliases ?? []).map((a) => a.alias).join(", ");
    return [ing.name, aliasText, ing.description ?? ""].filter(Boolean).join(" — ");
  });

  console.log(`→ Embedding ${ingredientTexts.length} ingredient nodes…`);
  const ingredientEmbeddings = embedTexts(ingredientTexts);

  const ingredientSlugToId = new Map<string, number>();
  for (let i = 0; i < allIngredients.length; i++) {
    const ing = allIngredients[i];
    const emb = ingredientEmbeddings[i];
    const [row] = await db
      .insert(ingredientsTable)
      .values({
        slug: ing.slug,
        canonicalName: ing.name,
        category: ing.category ?? null,
        description: ing.description ?? null,
        source: ing.source,
        sourceUrl: ing.source_url ?? null,
        embedding: emb,
      })
      .onConflictDoUpdate({
        target: ingredientsTable.slug,
        set: {
          canonicalName: ing.name,
          category: ing.category ?? null,
          description: ing.description ?? null,
          source: ing.source,
          sourceUrl: ing.source_url ?? null,
          embedding: emb,
        },
      })
      .returning({ id: ingredientsTable.id, slug: ingredientsTable.slug });
    ingredientSlugToId.set(row.slug, row.id);
  }

  // ── 3. External enrichment (OFF + USDA) ────────────────────────────
  let extraAliases: { ingredientSlug: string; alias: string; language: string }[] = [];
  let usdaAttached = 0;
  if (!opts.skipExternal) {
    console.log("→ Fetching Open Food Facts + USDA FoodData Central…");
    // For USDA we hit a small set of high-signal ingredients only (rate limits).
    const usdaTargets = allIngredients
      .filter((i) =>
        ["fish-sauce","oyster-sauce","worcestershire","soy-sauce","tahini","ghee","miso","dashi","panko","tamari"]
          .includes(i.slug),
      )
      .map((i) => ({ slug: i.slug, name: i.name }));
    const ext = await fetchExternalSources(usdaTargets);

    // OFF aliases live on allergen nodes, but we attach them to every ingredient
    // that is *directly* tagged with that allergen in YAML (so e.g. "huevo"
    // becomes searchable as a synonym for "egg" via the egg ingredient row).
    for (const ing of allIngredients) {
      for (const aSlug of ing.allergens ?? []) {
        const offAliases = ext.off[aSlug];
        if (!offAliases) continue;
        for (const a of offAliases) {
          extraAliases.push({
            ingredientSlug: ing.slug,
            alias: a.alias,
            language: a.language,
          });
        }
      }
    }

    // USDA: add the canonical USDA description as an alias and overwrite the
    // ingredient sourceUrl to point at FDC.
    for (const hit of ext.usda) {
      const id = ingredientSlugToId.get(hit.ingredientSlug);
      if (!id) continue;
      extraAliases.push({
        ingredientSlug: hit.ingredientSlug,
        alias: hit.description,
        language: "en",
      });
      await db
        .update(ingredientsTable)
        .set({
          sourceUrl: `https://fdc.nal.usda.gov/food-details/${hit.fdcId}/nutrients`,
        })
        .where(eq(ingredientsTable.id, id));
      usdaAttached++;
    }
  }

  // ── 4. Aliases (curated + external) ─────────────────────────────────
  const flatAliases: { ingredientSlug: string; alias: string; language: string }[] =
    [];
  for (const ing of allIngredients) {
    for (const a of ing.aliases ?? []) {
      flatAliases.push({
        ingredientSlug: ing.slug,
        alias: a.alias,
        language: a.language,
      });
    }
  }
  // Merge external, dedupe by (ingredient, alias.lowercase).
  const dedupe = new Set<string>();
  const merged: typeof flatAliases = [];
  for (const a of [...flatAliases, ...extraAliases]) {
    const key = `${a.ingredientSlug}::${a.alias.toLowerCase()}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    merged.push(a);
  }

  console.log(`→ Embedding ${merged.length} aliases (curated+external)…`);
  const aliasEmbeddings = embedTexts(merged.map((a) => a.alias));

  for (const ing of allIngredients) {
    const id = ingredientSlugToId.get(ing.slug)!;
    await db.delete(aliasesTable).where(eq(aliasesTable.ingredientId, id));
  }
  for (let i = 0; i < merged.length; i++) {
    const a = merged[i];
    const id = ingredientSlugToId.get(a.ingredientSlug);
    if (!id) continue;
    await db
      .insert(aliasesTable)
      .values({
        ingredientId: id,
        alias: a.alias,
        aliasLower: a.alias.toLowerCase(),
        language: a.language,
        embedding: aliasEmbeddings[i],
      })
      .onConflictDoNothing();
  }

  // ── 5. Direct allergen tags ────────────────────────────────────────
  for (const ing of allIngredients) {
    const id = ingredientSlugToId.get(ing.slug)!;
    await db
      .delete(ingredientAllergensTable)
      .where(eq(ingredientAllergensTable.ingredientId, id));
    for (const aSlug of ing.allergens ?? []) {
      const aId = allergenSlugToId.get(aSlug);
      if (!aId) {
        console.warn(`  [warn] unknown allergen slug "${aSlug}" on ${ing.slug}`);
        continue;
      }
      await db
        .insert(ingredientAllergensTable)
        .values({ ingredientId: id, allergenId: aId, confidence: 1 })
        .onConflictDoNothing();
    }
  }

  // ── 6. Derivations ──────────────────────────────────────────────────
  for (const d of graph.derivations) {
    const parentId = ingredientSlugToId.get(d.parent);
    const childId = ingredientSlugToId.get(d.child);
    if (!parentId || !childId) {
      console.warn(`  [warn] derivation skipped: ${d.parent} → ${d.child}`);
      continue;
    }
    await db
      .insert(derivationsTable)
      .values({
        parentId,
        childId,
        relation: d.relation,
        note: d.note ?? null,
      })
      .onConflictDoUpdate({
        target: [
          derivationsTable.parentId,
          derivationsTable.childId,
          derivationsTable.relation,
        ],
        set: { note: d.note ?? null },
      });
  }

  const [{ count: ingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ingredientsTable);
  const [{ count: aliasCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aliasesTable);
  const [{ count: derivCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(derivationsTable);

  return {
    ingredients: Number(ingCount),
    aliases: Number(aliasCount),
    derivations: Number(derivCount),
    externalAliasesAdded: extraAliases.length,
    usdaAttached,
  };
}

/**
 * Run on server boot. Cheap when already populated: a single COUNT query.
 * Triggers a full seed if the ingredients table is empty.
 */
export async function bootstrapKnowledgeGraph(): Promise<void> {
  try {
    // Defensive pre-flight: skip seeding entirely if the schema hasn't been
    // applied yet (drizzle push not run, missing pgvector extension, etc.).
    // The rest of the API does not require the knowledge graph in its hot
    // path, so it's safe to no-op here and let the operator run db push.
    const readyRes = await db.execute(sql`
      select (
        exists (select 1 from pg_extension where extname = 'vector')
        and to_regclass('public.ingredients') is not null
      ) as ready
    `);
    const readyRow = (readyRes as unknown as { rows?: Array<{ ready: boolean }> })
      .rows?.[0] ?? (readyRes as unknown as Array<{ ready: boolean }>)[0];
    if (!readyRow?.ready) {
      console.warn(
        "[knowledge-graph] schema not ready (missing pgvector extension or " +
          "ingredients table) — skipping bootstrap. Run `pnpm --filter " +
          "@workspace/db run push` after enabling pgvector to seed.",
      );
      return;
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ingredientsTable);
    if (Number(count) > 0) {
      return; // Already seeded.
    }
    console.log("[knowledge-graph] empty database detected; running first-run seed…");
    const t0 = Date.now();
    const result = await seedKnowledgeGraph();
    console.log(
      `[knowledge-graph] seeded in ${Date.now() - t0}ms: ` +
        `ingredients=${result.ingredients} aliases=${result.aliases} ` +
        `derivations=${result.derivations} (+${result.externalAliasesAdded} OFF aliases, ` +
        `${result.usdaAttached} USDA attachments)`,
    );
  } catch (err) {
    // Don't crash the server if seeding fails — log a concise warning and
    // continue. Recognized schema-setup errors are downgraded so they don't
    // look like a fatal server bug.
    const msg = err instanceof Error ? err.message : String(err);
    const isSchemaSetup =
      /relation .* does not exist/i.test(msg) ||
      /type "vector" does not exist/i.test(msg);
    if (isSchemaSetup) {
      console.warn(`[knowledge-graph] bootstrap skipped: ${msg}`);
    } else {
      console.error("[knowledge-graph] bootstrap failed:", err);
    }
  }
}
