import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const scanOutcomes = pgTable(
  "scan_outcomes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    dishName: text("dish_name").notNull(),
    translatedName: text("translated_name"),
    cuisine: text("cuisine"),
    restaurantSignals: jsonb("restaurant_signals"),
    ingredients: jsonb("ingredients").notNull(),
    features: jsonb("features").notNull(),
    severity: text("severity").notNull(),
    severityScore: integer("severity_score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("scan_outcomes_user_idx").on(t.userId, t.createdAt),
  ],
);

export const userRiskModels = pgTable(
  "user_risk_models",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    version: integer("version").notNull(),
    weights: jsonb("weights").notNull(),
    bias: text("bias").notNull(),
    featureNames: jsonb("feature_names").notNull(),
    trainedOn: integer("trained_on").notNull(),
    baselineLogloss: text("baseline_logloss"),
    modelLogloss: text("model_logloss"),
    promoted: integer("promoted").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("user_risk_models_user_idx").on(t.userId, t.version),
  ],
);

export type ScanOutcome = typeof scanOutcomes.$inferSelect;
export type InsertScanOutcome = typeof scanOutcomes.$inferInsert;
export type UserRiskModel = typeof userRiskModels.$inferSelect;
export type InsertUserRiskModel = typeof userRiskModels.$inferInsert;
