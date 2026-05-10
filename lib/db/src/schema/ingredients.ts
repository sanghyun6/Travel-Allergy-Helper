import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  vector,
  index,
  uniqueIndex,
  primaryKey,
  real,
} from "drizzle-orm/pg-core";
import { allergens } from "./allergens";

export const ingredients = pgTable(
  "ingredients",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    canonicalName: text("canonical_name").notNull(),
    category: text("category"),
    description: text("description"),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("ingredients_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const ingredientAliases = pgTable(
  "ingredient_aliases",
  {
    id: serial("id").primaryKey(),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    aliasLower: text("alias_lower").notNull(),
    language: text("language").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
  },
  (t) => [
    uniqueIndex("ingredient_aliases_unique").on(
      t.ingredientId,
      t.aliasLower,
      t.language,
    ),
    index("ingredient_aliases_alias_lower_idx").on(t.aliasLower),
    index("ingredient_aliases_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const ingredientAllergens = pgTable(
  "ingredient_allergens",
  {
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    allergenId: integer("allergen_id")
      .notNull()
      .references(() => allergens.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull().default(1),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.ingredientId, t.allergenId] })],
);

export const ingredientDerivations = pgTable(
  "ingredient_derivations",
  {
    id: serial("id").primaryKey(),
    parentId: integer("parent_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    childId: integer("child_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("ingredient_derivations_unique").on(
      t.parentId,
      t.childId,
      t.relation,
    ),
    index("ingredient_derivations_parent_idx").on(t.parentId),
    index("ingredient_derivations_child_idx").on(t.childId),
  ],
);

export type Ingredient = typeof ingredients.$inferSelect;
export type IngredientAlias = typeof ingredientAliases.$inferSelect;
export type IngredientAllergen = typeof ingredientAllergens.$inferSelect;
export type IngredientDerivation = typeof ingredientDerivations.$inferSelect;
