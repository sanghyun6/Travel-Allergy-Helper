import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const allergens = pgTable("allergens", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Allergen = typeof allergens.$inferSelect;
export type InsertAllergen = typeof allergens.$inferInsert;
