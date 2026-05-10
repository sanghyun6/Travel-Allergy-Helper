import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Activity, Brain, History as HistoryIcon, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInsights, listOutcomes, type RiskInsights, type OutcomeRecord } from "@/lib/risk-api";

export default function InsightsPage() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<RiskInsights | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getInsights(), listOutcomes()]).then(([d, o]) => {
      if (cancelled) return;
      setData(d);
      setOutcomes(o);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] pb-24 bg-background flex flex-col max-w-md mx-auto w-full">
      <header className="p-4 border-b bg-card sticky top-0 z-10 flex items-center gap-3">
        <button
          onClick={() => setLocation("/settings")}
          className="p-1.5 rounded-full hover:bg-muted"
          data-testid="button-back-to-settings"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Model Insights</h1>
      </header>

      <div className="p-4 space-y-6 flex-1 overflow-y-auto">
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            The personalized risk score is informational, not medical advice. It learns from
            outcomes you log, but should never replace consulting the restaurant or your doctor.
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground p-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <section className="grid grid-cols-3 gap-3">
              <Stat
                icon={Activity}
                label="Outcomes logged"
                value={String(data?.outcomeCount ?? 0)}
                testid="stat-outcome-count"
              />
              <Stat
                icon={Brain}
                label="Model version"
                value={data?.personalized ? `v${data.currentVersion}` : "baseline"}
                testid="stat-model-version"
              />
              <Stat
                icon={HistoryIcon}
                label="Until retrain"
                value={String(data?.nextRetrainIn ?? data?.retrainThreshold ?? 0)}
                testid="stat-next-retrain"
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Top risk drivers
              </h2>
              {(data?.topFeatures.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Log a few outcomes (Safe / Mild / Severe) and your top drivers will show up here.
                </p>
              ) : (
                <div className="space-y-2">
                  {data!.topFeatures.map((f) => {
                    const positive = f.weight > 0;
                    const mag = Math.min(1, Math.abs(f.weight));
                    return (
                      <div
                        key={f.feature}
                        className="p-3 rounded-xl border bg-card"
                        data-testid={`feature-${f.feature}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{f.label}</span>
                          <span
                            className={`text-xs font-semibold ${positive ? "text-red-600" : "text-green-700"}`}
                          >
                            {positive ? "↑ risk" : "↓ risk"}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${positive ? "bg-red-500" : "bg-green-600"}`}
                            style={{ width: `${mag * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Training history
              </h2>
              {(data?.history.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No retrains yet. We'll fine-tune your model after every {data?.retrainThreshold ?? 10} outcomes.
                </p>
              ) : (
                <div className="space-y-2">
                  {data!.history.map((h) => (
                    <div
                      key={h.version}
                      className="p-3 rounded-xl border bg-card text-sm space-y-1"
                      data-testid={`history-v${h.version}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">v{h.version}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            h.promoted
                              ? "bg-green-500/15 text-green-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {h.promoted ? "promoted" : "held back"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Trained on {h.trainedOn} outcomes ·{" "}
                        {h.modelLogloss != null && h.baselineLogloss != null
                          ? `loss ${h.modelLogloss.toFixed(3)} vs baseline ${h.baselineLogloss.toFixed(3)}`
                          : "no eval"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Recent outcomes
              </h2>
              {outcomes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  After scanning a dish, you can mark it Safe, Mild, or Severe to teach the model.
                </p>
              ) : (
                <div className="space-y-2">
                  {outcomes.slice(0, 20).map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between p-3 rounded-xl border bg-card text-sm"
                      data-testid={`outcome-${o.id}`}
                    >
                      <div className="min-w-0 pr-3">
                        <p className="font-medium truncate">
                          {o.translatedName || o.dishName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {new Date(o.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs px-2 py-1 rounded-full font-semibold ${
                          o.severity === "safe"
                            ? "bg-green-500/15 text-green-700"
                            : o.severity === "mild"
                            ? "bg-amber-500/15 text-amber-700"
                            : "bg-red-500/15 text-red-700"
                        }`}
                      >
                        {o.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Button
              variant="outline"
              className="w-full h-12 rounded-xl"
              onClick={() => setLocation("/camera")}
            >
              Scan another menu
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  testid,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  testid: string;
}) {
  return (
    <div className="p-3 rounded-2xl border bg-card text-center" data-testid={testid}>
      <Icon className="w-4 h-4 mx-auto text-primary" />
      <p className="text-lg font-bold mt-1">{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}
