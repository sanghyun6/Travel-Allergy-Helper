/**
 * Thin wrapper for the personalized risk endpoints. The endpoints are
 * device-scoped via the `x-device-id` header — same identity used by
 * the history routes — so we keep them off the generated React Query
 * client (which doesn't model that header) and call fetch directly.
 */
const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

function deviceId(): string {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("deviceId", id);
  }
  return id;
}

export type RiskAttribution = { feature: string; label: string; contribution: number };

export type RiskScoreItem = {
  name: string;
  score: number;
  personalized: boolean;
  modelVersion: number;
  cuisine: string;
  attributions: RiskAttribution[];
};

export type RiskScoreResult = {
  personalized: boolean;
  modelVersion: number;
  items: RiskScoreItem[];
};

export type DishForRisk = {
  name: string;
  translatedName?: string;
  description?: string;
  cuisine?: string | null;
  ingredients?: string[];
  allergenFlags: { name: string; severity: string }[];
  conflictingRestrictions?: string[];
  citations?: { allergen?: { slug?: string } }[];
};

export async function scoreRisk(
  items: DishForRisk[],
  restrictions: string[] = [],
): Promise<RiskScoreResult | null> {
  if (items.length === 0) return { personalized: false, modelVersion: 0, items: [] };
  try {
    const res = await fetch(`${API_BASE}/risk/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId() },
      body: JSON.stringify({
        restrictions,
        items: items.map((d) => ({
          name: d.name,
          translatedName: d.translatedName,
          description: d.description,
          cuisine: d.cuisine ?? null,
          ingredients: d.ingredients ?? [],
          allergenFlags: d.allergenFlags ?? [],
          conflictingRestrictions: d.conflictingRestrictions ?? [],
          citations: d.citations ?? [],
        })),
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("scoreRisk failed", err);
    return null;
  }
}

export type Severity = "safe" | "mild" | "severe";

export async function logOutcome(
  dish: DishForRisk,
  severity: Severity,
  cuisine?: string | null,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/risk/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId() },
      body: JSON.stringify({
        dish: {
          name: dish.name,
          translatedName: dish.translatedName,
          description: dish.description,
          cuisine: cuisine ?? dish.cuisine ?? null,
          ingredients: dish.ingredients ?? [],
          allergenFlags: dish.allergenFlags ?? [],
          conflictingRestrictions: dish.conflictingRestrictions ?? [],
          citations: dish.citations ?? [],
        },
        severity,
        cuisine: cuisine ?? null,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("logOutcome failed", err);
    return false;
  }
}

export type RiskInsights = {
  outcomeCount: number;
  personalized: boolean;
  currentVersion: number;
  retrainThreshold: number;
  nextRetrainIn: number;
  topFeatures: { feature: string; label: string; weight: number }[];
  history: {
    version: number;
    trainedOn: number;
    promoted: boolean;
    baselineLogloss: number | null;
    modelLogloss: number | null;
    createdAt: number;
  }[];
};

export async function getInsights(): Promise<RiskInsights | null> {
  try {
    const res = await fetch(`${API_BASE}/risk/insights`, {
      headers: { "x-device-id": deviceId() },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("getInsights failed", err);
    return null;
  }
}

export type OutcomeRecord = {
  id: number;
  dishName: string;
  translatedName: string | null;
  severity: string;
  severityScore: number;
  cuisine: string | null;
  createdAt: number;
};

export async function listOutcomes(): Promise<OutcomeRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/risk/outcomes`, {
      headers: { "x-device-id": deviceId() },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.outcomes) ? data.outcomes : [];
  } catch {
    return [];
  }
}
