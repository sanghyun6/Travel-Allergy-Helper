import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const kitchenPractices = pgTable(
  "kitchen_practices",
  {
    id: serial("id").primaryKey(),
    scopeKind: text("scope_kind").notNull(),
    scopeValue: text("scope_value").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("kitchen_practices_scope_unique").on(t.scopeKind, t.scopeValue),
  ],
);

export const practiceFacts = pgTable(
  "practice_facts",
  {
    id: serial("id").primaryKey(),
    scopeKind: text("scope_kind").notNull(),
    scopeValue: text("scope_value").notNull(),
    factType: text("fact_type").notNull(),
    confidence: real("confidence").notNull().default(0.7),
    source: text("source").notNull(),
    sourceSnippet: text("source_snippet"),
    allergens: text("allergens")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("practice_facts_scope_idx").on(t.scopeKind, t.scopeValue),
    index("practice_facts_type_idx").on(t.factType),
  ],
);

export const crossContamRules = pgTable(
  "cross_contam_rules",
  {
    id: serial("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    factType: text("fact_type").notNull(),
    severity: text("severity").notNull(),
    description: text("description").notNull(),
    appliesTo: text("applies_to").notNull(),
    affects: text("affects").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("cross_contam_rules_rule_id_unique").on(t.ruleId)],
);

export type KitchenPractice = typeof kitchenPractices.$inferSelect;
export type PracticeFact = typeof practiceFacts.$inferSelect;
export type InsertPracticeFact = typeof practiceFacts.$inferInsert;
export type CrossContamRule = typeof crossContamRules.$inferSelect;
