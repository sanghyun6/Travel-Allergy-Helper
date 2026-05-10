/**
 * Ingredient knowledge-graph retrieval service.
 *
 * Given a free-text ingredient string (in any language), returns the best
 * matching canonical ingredient node and the chain of derivations that
 * connect it to one or more allergens. Used by the menu scanner to attach
 * citation chains to flagged dishes.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  ingredients as ingredientsTable,
  ingredientAliases as aliasesTable,
  ingredientAllergens as ingredientAllergensTable,
  ingredientDerivations as derivationsTable,
  allergens as allergensTable,
} from "@workspace/db";
import { embedText } from "./embedding";

export type GraphIngredient = {
  id: number;
  slug: string;
  name: string;
  category: string | null;
  source: string;
  sourceUrl: string | null;
  description: string | null;
  aliases: { alias: string; language: string }[];
};

export type GraphAllergen = {
  slug: string;
  name: string;
  category: string;
};

export type CitationLink =
  | { kind: "ingredient"; ingredient: GraphIngredient }
  | { kind: "relation"; relation: string; note: string | null }
  | { kind: "allergen"; allergen: GraphAllergen };

export type CitationChain = {
  /** Raw text from the menu / extracted ingredient string */
  sourceText: string;
  /** Canonical node we matched the source text to */
  matched: GraphIngredient;
  /** Match distance (cosine 0-2). Lower = closer. */
  matchDistance: number;
  /** Allergen reached at the end of the chain */
  allergen: GraphAllergen;
  /** Ordered link sequence to render: ingredient → relation → ingredient → … → allergen */
  links: CitationLink[];
};

function vecLiteral(v: number[]) {
  return `[${v.join(",")}]`;
}

async function fetchIngredients(ids: number[]): Promise<Map<number, GraphIngredient>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select()
    .from(ingredientsTable)
    .where(inArray(ingredientsTable.id, ids));
  const aliasRows = await db
    .select()
    .from(aliasesTable)
    .where(inArray(aliasesTable.ingredientId, ids));
  const aliasesById = new Map<number, { alias: string; language: string }[]>();
  for (const a of aliasRows) {
    const arr = aliasesById.get(a.ingredientId) ?? [];
    arr.push({ alias: a.alias, language: a.language });
    aliasesById.set(a.ingredientId, arr);
  }
  const out = new Map<number, GraphIngredient>();
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.canonicalName,
      category: r.category,
      source: r.source,
      sourceUrl: r.sourceUrl,
      description: r.description,
      aliases: aliasesById.get(r.id) ?? [],
    });
  }
  return out;
}

/**
 * Resolve a free-text ingredient string to a canonical node.
 * Strategy:
 *   1. Exact case-insensitive alias match (covers "nam pla", "魚露", "soy sauce").
 *   2. Vector search over alias embeddings if no exact match.
 *   3. Vector search over canonical ingredient embeddings as a final fallback.
 *
 * Returns up to `topK` candidates with cosine distances.
 */
export async function resolveIngredient(
  text: string,
  topK = 3,
): Promise<{ ingredient: GraphIngredient; distance: number }[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();

  // 1. Exact alias hit
  const exact = await db
    .select({ ingredientId: aliasesTable.ingredientId })
    .from(aliasesTable)
    .where(eq(aliasesTable.aliasLower, lower))
    .limit(topK);
  if (exact.length > 0) {
    const ings = await fetchIngredients(exact.map((e) => e.ingredientId));
    return exact
      .map((e) => ings.get(e.ingredientId))
      .filter((x): x is GraphIngredient => !!x)
      .map((ingredient) => ({ ingredient, distance: 0 }));
  }

  // 2 + 3. Vector search
  const embedding = embedText(trimmed);
  const vec = vecLiteral(embedding);

  // Combined search: search aliases, take best ingredient per id, also union
  // canonical ingredients. We do two queries and merge.
  const aliasMatches = await db.execute<{
    ingredient_id: number;
    distance: number;
  }>(sql`
    SELECT ingredient_id,
           MIN(embedding <=> ${vec}::vector) AS distance
    FROM ingredient_aliases
    WHERE embedding IS NOT NULL
    GROUP BY ingredient_id
    ORDER BY distance ASC
    LIMIT ${topK * 2}
  `);

  const canonMatches = await db.execute<{
    id: number;
    distance: number;
  }>(sql`
    SELECT id, embedding <=> ${vec}::vector AS distance
    FROM ingredients
    WHERE embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT ${topK * 2}
  `);

  const merged = new Map<number, number>();
  for (const r of aliasMatches.rows) {
    const id = Number(r.ingredient_id);
    const d = Number(r.distance);
    if (!merged.has(id) || merged.get(id)! > d) merged.set(id, d);
  }
  for (const r of canonMatches.rows) {
    const id = Number(r.id);
    const d = Number(r.distance);
    if (!merged.has(id) || merged.get(id)! > d) merged.set(id, d);
  }
  const sorted = [...merged.entries()].sort((a, b) => a[1] - b[1]).slice(0, topK);
  if (sorted.length === 0) return [];

  const ings = await fetchIngredients(sorted.map(([id]) => id));
  return sorted
    .map(([id, d]) => {
      const ing = ings.get(id);
      return ing ? { ingredient: ing, distance: d } : null;
    })
    .filter((x): x is { ingredient: GraphIngredient; distance: number } => !!x);
}

type DerivationRow = {
  id: number;
  parentId: number;
  childId: number;
  relation: string;
  note: string | null;
};

type ChainResult = {
  pathIngredientIds: number[];
  edges: DerivationRow[];
  allergen: GraphAllergen;
};

/**
 * BFS from a starting ingredient through derivation edges (parent → child).
 * Returns the SHORTEST chain to EACH distinct allergen reachable from the
 * starting node within `maxDepth` steps. Empty array if none are reachable.
 *
 * Note that an ingredient may be tagged with several allergens directly
 * (e.g. soy sauce → soy + wheat); each is returned as its own chain even
 * though they share the same path.
 */
export async function findAllAllergenChains(
  startIngredientId: number,
  targetAllergenSlugs: Set<string>,
  maxDepth = 4,
): Promise<ChainResult[]> {
  // Helper: which allergens does each ingredient id directly carry?
  const directAllergens = async (ids: number[]) => {
    if (ids.length === 0) return new Map<number, GraphAllergen[]>();
    const rows = await db
      .select({
        ingredientId: ingredientAllergensTable.ingredientId,
        slug: allergensTable.slug,
        name: allergensTable.name,
        category: allergensTable.category,
      })
      .from(ingredientAllergensTable)
      .innerJoin(
        allergensTable,
        eq(ingredientAllergensTable.allergenId, allergensTable.id),
      )
      .where(inArray(ingredientAllergensTable.ingredientId, ids));
    const out = new Map<number, GraphAllergen[]>();
    for (const r of rows) {
      const arr = out.get(r.ingredientId) ?? [];
      arr.push({ slug: r.slug, name: r.name, category: r.category });
      out.set(r.ingredientId, arr);
    }
    return out;
  };

  // Track the shortest chain to each (allergen slug) we've reached.
  const reached = new Map<string, ChainResult>();

  const recordHits = (
    nodeId: number,
    path: number[],
    edges: DerivationRow[],
    tags: GraphAllergen[] | undefined,
  ) => {
    if (!tags) return;
    for (const a of tags) {
      if (!targetAllergenSlugs.has(a.slug)) continue;
      const existing = reached.get(a.slug);
      if (!existing || existing.edges.length > edges.length) {
        reached.set(a.slug, {
          pathIngredientIds: path,
          edges,
          allergen: a,
        });
      }
    }
    void nodeId;
  };

  // 0-hop check on start node
  const startTags = await directAllergens([startIngredientId]);
  recordHits(startIngredientId, [startIngredientId], [], startTags.get(startIngredientId));

  // BFS along derivations (parent → child).
  type QueueEntry = { id: number; path: number[]; edges: DerivationRow[] };
  const visited = new Set<number>([startIngredientId]);
  let frontier: QueueEntry[] = [
    { id: startIngredientId, path: [startIngredientId], edges: [] },
  ];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const ids = frontier.map((f) => f.id);
    const edges = await db
      .select()
      .from(derivationsTable)
      .where(inArray(derivationsTable.parentId, ids));
    if (edges.length === 0) break;

    const childIds = [...new Set(edges.map((e) => e.childId))];
    const tagMap = await directAllergens(childIds);

    const next: QueueEntry[] = [];
    for (const f of frontier) {
      const outgoing = edges.filter((e) => e.parentId === f.id);
      for (const e of outgoing) {
        if (visited.has(e.childId)) continue;
        visited.add(e.childId);
        const nextPath = [...f.path, e.childId];
        const nextEdges = [...f.edges, e];
        recordHits(e.childId, nextPath, nextEdges, tagMap.get(e.childId));
        next.push({ id: e.childId, path: nextPath, edges: nextEdges });
      }
    }
    frontier = next;
  }

  return [...reached.values()];
}

/**
 * High-level helper: given extracted ingredient strings and a set of allergen
 * slugs we care about, return citation chains for whichever ingredients
 * resolve to one of those allergens (directly or via derivation).
 */
export async function buildCitationChains(
  ingredientTexts: string[],
  targetAllergenSlugs: string[],
): Promise<CitationChain[]> {
  if (ingredientTexts.length === 0 || targetAllergenSlugs.length === 0) return [];
  const targetSet = new Set(targetAllergenSlugs);
  const seenAllergens = new Set<string>(); // dedupe by (sourceSlug, allergenSlug)
  const out: CitationChain[] = [];

  for (const raw of ingredientTexts) {
    const matches = await resolveIngredient(raw, 1);
    if (matches.length === 0) continue;
    const top = matches[0];
    // If the closest match isn't very close, skip.
    if (top.distance > 0.6) continue;

    const chains = await findAllAllergenChains(top.ingredient.id, targetSet);
    if (chains.length === 0) continue;

    for (const chain of chains) {
      const dedupeKey = `${top.ingredient.slug}::${chain.allergen.slug}`;
      if (seenAllergens.has(dedupeKey)) continue;
      seenAllergens.add(dedupeKey);

      const ings = await fetchIngredients(chain.pathIngredientIds);
      const links: CitationLink[] = [];
      for (let i = 0; i < chain.pathIngredientIds.length; i++) {
        const ing = ings.get(chain.pathIngredientIds[i]);
        if (!ing) continue;
        links.push({ kind: "ingredient", ingredient: ing });
        if (i < chain.edges.length) {
          const e = chain.edges[i];
          links.push({ kind: "relation", relation: e.relation, note: e.note });
        }
      }
      links.push({ kind: "allergen", allergen: chain.allergen });

      out.push({
        sourceText: raw,
        matched: top.ingredient,
        matchDistance: top.distance,
        allergen: chain.allergen,
        links,
      });
    }
  }
  return out;
}
