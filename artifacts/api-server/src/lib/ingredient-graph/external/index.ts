/**
 * Importers for external nutrition / ingredient data sources.
 *
 *   1. Open Food Facts allergen taxonomy
 *      https://static.openfoodfacts.org/data/taxonomies/allergens.json
 *      Provides multilingual translations for the 14 EU regulated allergens
 *      (peanut, milk, gluten, fish, crustaceans, soybeans, sesame, eggs, …).
 *      We use it to enrich allergen-name aliases across dozens of languages.
 *
 *   2. USDA FoodData Central
 *      https://fdc.nal.usda.gov/api-guide
 *      Public REST API. We hit `/foods/search` for each curated ingredient
 *      and pull the canonical `description` + `foodCategory` to attach as
 *      additional aliases (and to confirm the source attribution).
 *
 * Both fetchers have short timeouts and fall back to a checked-in snapshot
 * (`data/external-sources-snapshot.json`) so seed runs work offline and stay
 * deterministic.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In dev (tsx) __dirname is src/lib/ingredient-graph/external; in the
// bundled prod build it's wherever esbuild emits dist/. The data file lives
// at the artifact root: artifacts/api-server/data/. Try both locations.
const SNAPSHOT_CANDIDATES = [
  resolve(__dirname, "..", "..", "..", "..", "data", "external-sources-snapshot.json"),
  resolve(__dirname, "..", "data", "external-sources-snapshot.json"),
  resolve(process.cwd(), "data", "external-sources-snapshot.json"),
];
const SNAPSHOT_PATH = SNAPSHOT_CANDIDATES[0];

const OFF_TAXONOMY_URL =
  "https://static.openfoodfacts.org/data/taxonomies/allergens.json";
const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

// Map our internal allergen slugs ↔ Open Food Facts allergen taxonomy keys.
const OFF_ALLERGEN_KEY: Record<string, string> = {
  peanut:    "en:peanuts",
  "tree-nut":"en:nuts",
  milk:      "en:milk",
  egg:       "en:eggs",
  wheat:     "en:gluten",
  soy:       "en:soybeans",
  fish:      "en:fish",
  shellfish: "en:crustaceans",
  sesame:    "en:sesame-seeds",
  mustard:   "en:mustard",
  sulphite:  "en:sulphur-dioxide-and-sulphites",
  celery:    "en:celery",
};

export type OffAllergenAliases = Record<string, { language: string; alias: string }[]>;
export type UsdaIngredientHit = {
  ingredientSlug: string;
  description: string;
  category: string | null;
  fdcId: number;
};

export type ExternalSnapshot = {
  capturedAt: string;
  off: OffAllergenAliases;
  usda: UsdaIngredientHit[];
};

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function loadSnapshot(): ExternalSnapshot | null {
  for (const p of SNAPSHOT_CANDIDATES) {
    try {
      const raw = readFileSync(p, "utf8");
      return JSON.parse(raw) as ExternalSnapshot;
    } catch {
      continue;
    }
  }
  return null;
}

function saveSnapshot(snap: ExternalSnapshot): void {
  try {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2) + "\n");
  } catch (err) {
    console.warn("  [warn] could not write external-sources snapshot:", err);
  }
}

/**
 * Pull multilingual aliases per allergen slug from the OFF taxonomy.
 * Returns a map allergenSlug → list of {language, alias}.
 */
export async function fetchOffAllergenAliases(): Promise<OffAllergenAliases> {
  try {
    const res = await fetchWithTimeout(OFF_TAXONOMY_URL, 6000);
    if (!res.ok) throw new Error(`OFF returned HTTP ${res.status}`);
    const taxonomy = (await res.json()) as Record<
      string,
      { name?: Record<string, string> }
    >;
    const out: OffAllergenAliases = {};
    for (const [ourSlug, offKey] of Object.entries(OFF_ALLERGEN_KEY)) {
      const node = taxonomy[offKey];
      if (!node?.name) continue;
      const seen = new Set<string>();
      const aliases: { language: string; alias: string }[] = [];
      for (const [lang, name] of Object.entries(node.name)) {
        const a = name.trim();
        if (!a || seen.has(a.toLowerCase())) continue;
        seen.add(a.toLowerCase());
        aliases.push({ language: lang, alias: a });
      }
      out[ourSlug] = aliases;
    }
    console.log(
      `  ✓ OFF taxonomy: ${Object.keys(out).length} allergens, ` +
        `${Object.values(out).reduce((n, a) => n + a.length, 0)} aliases`,
    );
    return out;
  } catch (err) {
    console.warn(`  [warn] OFF fetch failed (${(err as Error).message}); using snapshot`);
    return loadSnapshot()?.off ?? {};
  }
}

/**
 * Hit USDA FoodData Central for the given curated ingredients (so we can
 * attach an authoritative third-party citation + canonical description).
 *
 * Uses DEMO_KEY by default so the script works without configuration; if
 * USDA_FDC_API_KEY is set we use it for higher rate limits.
 */
export async function fetchUsdaIngredientHits(
  queries: { slug: string; name: string }[],
): Promise<UsdaIngredientHit[]> {
  const apiKey = process.env["USDA_FDC_API_KEY"] || "DEMO_KEY";
  const out: UsdaIngredientHit[] = [];
  let failures = 0;

  for (const q of queries) {
    if (failures >= 3) {
      // Stop hammering once we've hit consecutive failures (likely rate
      // limited on DEMO_KEY). Snapshot will fill in the rest below.
      break;
    }
    try {
      const url =
        `${USDA_SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}` +
        `&query=${encodeURIComponent(q.name)}&pageSize=1`;
      const res = await fetchWithTimeout(url, 5000);
      if (!res.ok) {
        failures++;
        continue;
      }
      const data = (await res.json()) as {
        foods?: { fdcId: number; description: string; foodCategory?: string }[];
      };
      const top = data.foods?.[0];
      if (!top) continue;
      out.push({
        ingredientSlug: q.slug,
        description: top.description,
        category: top.foodCategory ?? null,
        fdcId: top.fdcId,
      });
      failures = 0;
    } catch {
      failures++;
    }
  }

  if (out.length === 0) {
    console.warn("  [warn] USDA fetch returned nothing; falling back to snapshot");
    return loadSnapshot()?.usda ?? [];
  }
  console.log(`  ✓ USDA: ${out.length}/${queries.length} ingredient hits`);
  return out;
}

/**
 * Convenience wrapper: fetch both sources, refresh the cached snapshot, and
 * return the combined result. The snapshot only updates when we got *new*
 * data, so we never overwrite good data with empty fallbacks.
 */
export async function fetchExternalSources(
  usdaQueries: { slug: string; name: string }[],
): Promise<ExternalSnapshot> {
  const [off, usda] = await Promise.all([
    fetchOffAllergenAliases(),
    fetchUsdaIngredientHits(usdaQueries),
  ]);
  const snap: ExternalSnapshot = {
    capturedAt: new Date().toISOString(),
    off,
    usda,
  };
  if (Object.keys(off).length > 0 && usda.length > 0) {
    saveSnapshot(snap);
  } else {
    // Merge with whatever snapshot is on disk so partial failures don't
    // wipe out the good half.
    const cached = loadSnapshot();
    if (cached) {
      if (Object.keys(off).length === 0) snap.off = cached.off;
      if (usda.length === 0) snap.usda = cached.usda;
    }
  }
  return snap;
}
