/**
 * Persistence helpers for kitchen practices + facts.
 *
 * The schema is created lazily via CREATE TABLE IF NOT EXISTS so the routes
 * keep working before `pnpm --filter @workspace/db push` is run on a fresh
 * environment. Same defensive pattern as the knowledge-graph bootstrap.
 */
import { db, pool, kitchenPractices, practiceFacts, crossContamRules } from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import type { PracticeFact } from "./types";
import { RULES } from "./rules";

let schemaReady: Promise<boolean> | null = null;

export function ensurePracticesSchema(): Promise<boolean> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS kitchen_practices (
          id SERIAL PRIMARY KEY,
          scope_kind TEXT NOT NULL,
          scope_value TEXT NOT NULL,
          label TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS kitchen_practices_scope_unique
          ON kitchen_practices(scope_kind, scope_value);
        CREATE TABLE IF NOT EXISTS practice_facts (
          id SERIAL PRIMARY KEY,
          scope_kind TEXT NOT NULL,
          scope_value TEXT NOT NULL,
          fact_type TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 0.7,
          source TEXT NOT NULL,
          source_snippet TEXT,
          allergens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE practice_facts
          ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
        CREATE INDEX IF NOT EXISTS practice_facts_scope_idx
          ON practice_facts(scope_kind, scope_value);
        CREATE INDEX IF NOT EXISTS practice_facts_type_idx
          ON practice_facts(fact_type);
        -- Dedupe key: prevents identical (scope, fact_type, snippet, source)
        -- rows from stacking each time a user submits the same review or
        -- rescans the same disclaimer. md5(coalesce(...)) keeps NULL
        -- snippets collapsing to a single canonical empty value.
        CREATE UNIQUE INDEX IF NOT EXISTS practice_facts_dedupe_unique
          ON practice_facts(
            scope_kind,
            scope_value,
            fact_type,
            source,
            md5(COALESCE(source_snippet, ''))
          );
        CREATE TABLE IF NOT EXISTS cross_contam_rules (
          id SERIAL PRIMARY KEY,
          rule_id TEXT NOT NULL,
          fact_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          description TEXT NOT NULL,
          applies_to TEXT NOT NULL,
          affects TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS cross_contam_rules_rule_id_unique
          ON cross_contam_rules(rule_id);
      `);
      // Sync rule registry — file-based RULES is the source of truth, the
      // table is a mirror so analysts can inspect what rules exist.
      for (const r of RULES) {
        await db
          .insert(crossContamRules)
          .values({
            ruleId: r.id,
            factType: r.factType,
            severity: r.severity,
            description: r.description,
            appliesTo: "see rules.ts (code-defined predicate)",
            affects: "see rules.ts (code-defined predicate)",
          })
          .onConflictDoUpdate({
            target: crossContamRules.ruleId,
            set: {
              factType: r.factType,
              severity: r.severity,
              description: r.description,
              updatedAt: new Date(),
            },
          });
      }
      return true;
    } catch (err) {
      console.warn("[cross-contam] schema bootstrap failed:", err);
      return false;
    }
  })();
  return schemaReady;
}

export async function persistFacts(
  facts: PracticeFact[],
): Promise<number> {
  if (facts.length === 0) return 0;
  const ok = await ensurePracticesSchema();
  if (!ok) return 0;

  // Upsert kitchen_practices rows for each scope (idempotent).
  const scopes = new Set<string>();
  for (const f of facts) scopes.add(`${f.scopeKind}::${f.scopeValue}`);
  for (const s of scopes) {
    const [kind, value] = s.split("::");
    await db
      .insert(kitchenPractices)
      .values({ scopeKind: kind, scopeValue: value })
      .onConflictDoNothing();
  }

  // Use raw SQL for the upsert so we can target the partial md5() unique
  // index above (drizzle's onConflictDoNothing doesn't currently let us
  // express expression-indexed conflict targets cleanly).
  let inserted = 0;
  for (const f of facts) {
    const r = await pool.query(
      `INSERT INTO practice_facts
        (scope_kind, scope_value, fact_type, confidence, source, source_snippet, allergens)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (scope_kind, scope_value, fact_type, source, md5(COALESCE(source_snippet, '')))
       DO NOTHING`,
      [
        f.scopeKind,
        f.scopeValue,
        f.factType,
        f.confidence,
        f.source,
        f.sourceSnippet ?? null,
        f.allergens ?? [],
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

export async function loadFactsForScopes(
  scopes: { kind: "cuisine" | "restaurant"; value: string }[],
): Promise<PracticeFact[]> {
  if (scopes.length === 0) return [];
  const ok = await ensurePracticesSchema();
  if (!ok) return [];

  const out: PracticeFact[] = [];
  for (const s of scopes) {
    const rows = await db
      .select()
      .from(practiceFacts)
      .where(
        and(
          eq(practiceFacts.scopeKind, s.kind),
          eq(practiceFacts.scopeValue, s.value),
        ),
      )
      .orderBy(desc(practiceFacts.createdAt))
      .limit(100);
    for (const r of rows) {
      out.push({
        id: r.id,
        scopeKind: r.scopeKind as "cuisine" | "restaurant",
        scopeValue: r.scopeValue,
        factType: r.factType as PracticeFact["factType"],
        confidence: r.confidence,
        source: r.source as PracticeFact["source"],
        sourceSnippet: r.sourceSnippet,
        allergens: (r as { allergens?: string[] | null }).allergens ?? [],
      });
    }
  }
  return out;
}

export async function countFacts(): Promise<number> {
  const ok = await ensurePracticesSchema();
  if (!ok) return 0;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(practiceFacts);
  return Number(n);
}
