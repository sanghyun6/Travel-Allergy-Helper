import { Router } from "express";
import { db, scanOutcomes, userRiskModels } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { buildFeatures, FEATURE_NAMES, type RawDish } from "../lib/risk/features";
import {
  getBaselineModel,
  predictProb,
  topAttributions,
  trainPersonalModel,
  type RiskModel,
} from "../lib/risk/model";

const router = Router();

const RETRAIN_THRESHOLD = (() => {
  const raw = process.env.RISK_RETRAIN_THRESHOLD;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 10;
})();

function getUserId(req: import("express").Request): string | null {
  const header = req.header("x-device-id");
  if (header && typeof header === "string" && header.length > 0 && header.length < 200) {
    return header;
  }
  return null;
}

const userModelCache = new Map<string, { model: RiskModel; loadedAt: number }>();
const lastRetrain = new Map<string, number>();

async function loadUserModel(userId: string): Promise<RiskModel | null> {
  const cached = userModelCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < 60_000) return cached.model;
  const [row] = await db
    .select()
    .from(userRiskModels)
    .where(and(eq(userRiskModels.userId, userId), eq(userRiskModels.promoted, 1)))
    .orderBy(desc(userRiskModels.version))
    .limit(1);
  if (!row) {
    userModelCache.delete(userId);
    return null;
  }
  const m: RiskModel = {
    weights: row.weights as number[],
    bias: Number(row.bias),
    featureNames: row.featureNames as string[],
    trainedOn: row.trainedOn,
    version: row.version,
  };
  userModelCache.set(userId, { model: m, loadedAt: Date.now() });
  return m;
}

function severityToScore(severity: string): number {
  if (severity === "safe") return 0;
  if (severity === "mild") return 0.6;
  if (severity === "severe") return 1;
  return 0;
}

function humanizeFeature(name: string): string {
  if (name.startsWith("ing_emb_")) return "Ingredient profile";
  if (name.startsWith("allergen_")) return `Flagged allergen: ${name.slice("allergen_".length)}`;
  if (name.startsWith("citation_")) return `Traced to allergen: ${name.slice("citation_".length)}`;
  if (name.startsWith("cuisine_")) return `Cuisine: ${name.slice("cuisine_".length)}`;
  if (name.startsWith("deriv_")) return `Contains ${name.slice("deriv_".length).replace(/-/g, " ")}`;
  if (name === "ingredient_count") return "Ingredient complexity";
  if (name === "conflicting_count") return "Listed restriction conflicts";
  if (name === "severity_high_count") return "High-severity allergen flags";
  if (name === "severity_medium_count") return "Medium-severity allergen flags";
  return name;
}

async function maybeTriggerRetrain(userId: string) {
  const last = lastRetrain.get(userId) ?? 0;
  if (Date.now() - last < 5_000) return;
  lastRetrain.set(userId, Date.now());
  // Fire-and-forget background job. Errors are logged, never bubbled.
  (async () => {
    try {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(scanOutcomes)
        .where(eq(scanOutcomes.userId, userId));
      if (count < RETRAIN_THRESHOLD) return;

      const [latestModel] = await db
        .select()
        .from(userRiskModels)
        .where(eq(userRiskModels.userId, userId))
        .orderBy(desc(userRiskModels.version))
        .limit(1);

      // Don't retrain if the latest model already saw most of the outcomes
      if (latestModel && count - latestModel.trainedOn < RETRAIN_THRESHOLD) return;

      const rows = await db
        .select()
        .from(scanOutcomes)
        .where(eq(scanOutcomes.userId, userId))
        .orderBy(desc(scanOutcomes.createdAt))
        .limit(500);

      const outcomes = rows
        .map((r) => {
          const features = r.features as number[];
          if (!Array.isArray(features) || features.length !== FEATURE_NAMES.length) return null;
          return { features, y: r.severityScore / 100 };
        })
        .filter((o): o is { features: number[]; y: number } => o !== null);

      if (outcomes.length < RETRAIN_THRESHOLD) return;

      const baseline = getBaselineModel();
      const prior = latestModel
        ? ({
            weights: latestModel.weights as number[],
            bias: Number(latestModel.bias),
            featureNames: latestModel.featureNames as string[],
            trainedOn: latestModel.trainedOn,
            version: latestModel.version,
          } as RiskModel)
        : null;

      const result = trainPersonalModel(outcomes, baseline, prior);
      const promote =
        result.candidateLogloss <
        Math.min(
          result.baselineLogloss,
          prior
            ? // Compare to prior on same eval, approximated here as baselineLogloss
              result.baselineLogloss
            : Infinity,
        ) - 0.001;

      const nextVersion = (latestModel?.version ?? 0) + 1;
      await db.insert(userRiskModels).values({
        userId,
        version: nextVersion,
        weights: result.candidate.weights,
        bias: String(result.candidate.bias),
        featureNames: FEATURE_NAMES,
        trainedOn: outcomes.length,
        baselineLogloss: result.baselineLogloss.toFixed(6),
        modelLogloss: result.candidateLogloss.toFixed(6),
        promoted: promote ? 1 : 0,
      });
      if (promote) userModelCache.delete(userId);
      console.log(
        `[risk] user=${userId} v${nextVersion} train=${result.trainSize} eval=${result.evalSize} ` +
          `baseline=${result.baselineLogloss.toFixed(4)} cand=${result.candidateLogloss.toFixed(4)} ` +
          `promoted=${promote}`,
      );
    } catch (err) {
      console.error("[risk] retrain failed", err);
    }
  })().catch(() => {});
}

router.post("/risk/score", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(400).json({ error: "Missing x-device-id header" });
    return;
  }
  const items = Array.isArray(req.body?.items) ? (req.body.items as RawDish[]) : [];
  const userModel = await loadUserModel(userId);
  const baseline = getBaselineModel();
  const model = userModel ?? baseline;
  const personalized = !!userModel;

  const scored = items.map((dish) => {
    const { vector, meta } = buildFeatures(dish);
    const prob = predictProb(model, vector);
    const attributions = topAttributions(model, vector, 3).map((a) => ({
      feature: a.name,
      label: humanizeFeature(a.name),
      contribution: Number(a.contribution.toFixed(4)),
    }));
    return {
      name: dish.name,
      score: Math.round(prob * 100),
      personalized,
      modelVersion: model.version,
      cuisine: meta.cuisine,
      attributions,
    };
  });

  res.json({
    personalized,
    modelVersion: model.version,
    items: scored,
  });
});

router.post("/risk/outcome", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(400).json({ error: "Missing x-device-id header" });
    return;
  }
  const { dish, severity, cuisine, restaurantSignals } = req.body ?? {};
  if (!dish || typeof dish !== "object" || typeof dish.name !== "string") {
    res.status(400).json({ error: "Invalid dish" });
    return;
  }
  if (severity !== "safe" && severity !== "mild" && severity !== "severe") {
    res.status(400).json({ error: "severity must be safe|mild|severe" });
    return;
  }
  const rawDish: RawDish = {
    name: dish.name,
    translatedName: dish.translatedName,
    description: dish.description,
    cuisine: cuisine ?? null,
    ingredients: Array.isArray(dish.ingredients) ? dish.ingredients : [],
    allergenFlags: Array.isArray(dish.allergenFlags) ? dish.allergenFlags : [],
    conflictingRestrictions: Array.isArray(dish.conflictingRestrictions)
      ? dish.conflictingRestrictions
      : [],
    citations: Array.isArray(dish.citations) ? dish.citations : [],
  };
  const { vector } = buildFeatures(rawDish);
  const sevScore = Math.round(severityToScore(severity) * 100);
  const [inserted] = await db
    .insert(scanOutcomes)
    .values({
      userId,
      dishName: rawDish.name,
      translatedName: rawDish.translatedName ?? null,
      cuisine: rawDish.cuisine ?? null,
      restaurantSignals: restaurantSignals ?? null,
      ingredients: rawDish.ingredients,
      features: vector,
      severity,
      severityScore: sevScore,
    })
    .returning();
  await maybeTriggerRetrain(userId);
  res.json({ ok: true, id: inserted.id });
});

router.get("/risk/outcomes", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(400).json({ error: "Missing x-device-id header" });
    return;
  }
  const rows = await db
    .select({
      id: scanOutcomes.id,
      dishName: scanOutcomes.dishName,
      translatedName: scanOutcomes.translatedName,
      severity: scanOutcomes.severity,
      severityScore: scanOutcomes.severityScore,
      cuisine: scanOutcomes.cuisine,
      createdAt: scanOutcomes.createdAt,
    })
    .from(scanOutcomes)
    .where(eq(scanOutcomes.userId, userId))
    .orderBy(desc(scanOutcomes.createdAt))
    .limit(100);
  res.json({
    outcomes: rows.map((r) => ({
      id: r.id,
      dishName: r.dishName,
      translatedName: r.translatedName ?? null,
      severity: r.severity,
      severityScore: r.severityScore,
      cuisine: r.cuisine ?? null,
      createdAt: r.createdAt.getTime(),
    })),
  });
});

router.get("/risk/insights", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(400).json({ error: "Missing x-device-id header" });
    return;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scanOutcomes)
    .where(eq(scanOutcomes.userId, userId));
  const history = await db
    .select()
    .from(userRiskModels)
    .where(eq(userRiskModels.userId, userId))
    .orderBy(desc(userRiskModels.version))
    .limit(10);
  const userModel = await loadUserModel(userId);
  const model = userModel ?? getBaselineModel();
  const topFeatures = model.weights
    .map((w, i) => ({ name: FEATURE_NAMES[i] ?? `f_${i}`, weight: w }))
    .filter((f) => Math.abs(f.weight) > 1e-4)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 8)
    .map((f) => ({
      feature: f.name,
      label: humanizeFeature(f.name),
      weight: Number(f.weight.toFixed(4)),
    }));

  res.json({
    outcomeCount: count,
    personalized: !!userModel,
    currentVersion: model.version,
    retrainThreshold: RETRAIN_THRESHOLD,
    nextRetrainIn: Math.max(
      0,
      RETRAIN_THRESHOLD - (count - (history[0]?.trainedOn ?? 0)),
    ),
    topFeatures,
    history: history.map((h) => ({
      version: h.version,
      trainedOn: h.trainedOn,
      promoted: h.promoted === 1,
      baselineLogloss: h.baselineLogloss ? Number(h.baselineLogloss) : null,
      modelLogloss: h.modelLogloss ? Number(h.modelLogloss) : null,
      createdAt: h.createdAt.getTime(),
    })),
  });
});

export default router;
