import { useEffect, useState } from "react";
import { Loader2, Activity, ThumbsUp, AlertCircle, AlertOctagon, Check } from "lucide-react";
import {
  scoreRisk,
  logOutcome,
  type RiskScoreItem,
  type DishForRisk,
  type Severity,
} from "@/lib/risk-api";

function levelColor(score: number): { bar: string; text: string; label: string } {
  if (score >= 70) return { bar: "bg-red-500", text: "text-red-600", label: "High risk" };
  if (score >= 40) return { bar: "bg-amber-500", text: "text-amber-600", label: "Moderate" };
  return { bar: "bg-green-600", text: "text-green-700", label: "Low risk" };
}

export function RiskScoreBadge({
  result,
  loading,
}: {
  result: RiskScoreItem | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-2xl bg-muted/50 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Computing personalized risk…
      </div>
    );
  }
  if (!result) return null;
  const c = levelColor(result.score);
  const top = result.attributions
    .filter((a) => a.contribution > 0)
    .slice(0, 2)
    .map((a) => a.label);
  const reason = top.length > 0 ? top.join(" · ") : "Based on baseline patterns";
  return (
    <div className="p-3 rounded-2xl bg-muted/50 space-y-2" data-testid="risk-score-badge">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${c.text}`} />
          <span className="text-sm font-semibold">
            Personalized risk: <span className={c.text}>{result.score}/100</span>
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {result.personalized ? `your model v${result.modelVersion}` : "baseline"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-background overflow-hidden">
        <div
          className={`h-full ${c.bar} transition-all`}
          style={{ width: `${Math.min(100, Math.max(2, result.score))}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground leading-snug">
        <span className="font-medium">{c.label}.</span> {reason}.
      </p>
      <p className="text-[10px] text-muted-foreground italic leading-snug">
        Informational only — not medical advice. Always confirm with the restaurant if you have a serious allergy.
      </p>
    </div>
  );
}

export function OutcomeButtons({
  dish,
  cuisine,
  compact,
}: {
  dish: DishForRisk;
  cuisine?: string | null;
  compact?: boolean;
}) {
  const [logged, setLogged] = useState<Severity | null>(null);
  const [busy, setBusy] = useState<Severity | null>(null);

  const log = async (s: Severity) => {
    setBusy(s);
    const ok = await logOutcome(dish, s, cuisine ?? null);
    setBusy(null);
    if (ok) setLogged(s);
  };

  const buttons: { sev: Severity; label: string; icon: typeof ThumbsUp; cls: string }[] = [
    { sev: "safe", label: "Safe", icon: ThumbsUp, cls: "border-green-500/40 hover:bg-green-500/10 text-green-700" },
    { sev: "mild", label: "Mild reaction", icon: AlertCircle, cls: "border-amber-500/40 hover:bg-amber-500/10 text-amber-700" },
    { sev: "severe", label: "Severe", icon: AlertOctagon, cls: "border-red-500/40 hover:bg-red-500/10 text-red-700" },
  ];

  if (logged) {
    return (
      <div
        className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 text-sm text-primary"
        data-testid="outcome-logged"
      >
        <Check className="w-4 h-4" />
        Logged as <span className="font-semibold">{logged}</span>. Your model will improve next time.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="outcome-buttons">
      {!compact && (
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          How did this dish go?
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {buttons.map(({ sev, label, icon: Icon, cls }) => (
          <button
            key={sev}
            onClick={() => log(sev)}
            disabled={!!busy}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl border bg-card text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}
            data-testid={`button-outcome-${sev}`}
          >
            {busy === sev ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Icon className="w-4 h-4" />
            )}
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function useRiskScore(dish: DishForRisk | null) {
  const [data, setData] = useState<RiskScoreItem | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!dish) {
      setData(null);
      return;
    }
    setLoading(true);
    scoreRisk([dish]).then((r) => {
      if (cancelled) return;
      setData(r?.items?.[0] ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dish?.name]);
  return { data, loading };
}
