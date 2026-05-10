import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, ShieldQuestion, ShieldCheck, Flame } from "lucide-react";
import type { CrossContamItem, CrossContamRisk, FiredRule } from "@/lib/cross-contam-api";

function riskMeta(risk: CrossContamRisk): {
  label: string;
  bg: string;
  text: string;
  Icon: typeof Flame;
} {
  switch (risk) {
    case "high":
      return { label: "High cross-contact risk", bg: "bg-red-500/10 border-red-400/40", text: "text-red-700", Icon: Flame };
    case "medium":
      return { label: "Medium cross-contact risk", bg: "bg-amber-500/10 border-amber-400/40", text: "text-amber-700", Icon: AlertTriangle };
    case "low":
      return { label: "Low cross-contact risk", bg: "bg-green-500/10 border-green-500/40", text: "text-green-700", Icon: ShieldCheck };
    case "unknown":
    default:
      return { label: "Unknown — not enough info", bg: "bg-muted/60 border-border", text: "text-muted-foreground", Icon: ShieldQuestion };
  }
}

function sourceLabel(s: string): string {
  if (s === "menu_disclaimer") return "menu disclaimer";
  if (s === "review") return "review snippet";
  if (s === "cuisine_default") return "cuisine norm";
  if (s === "user_note") return "your note";
  return s;
}

function FiredRuleRow({ rule }: { rule: FiredRule }) {
  return (
    <div className="text-xs space-y-1 p-2.5 rounded-lg bg-background border">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold capitalize">
          {rule.severity} · {rule.allergen}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {rule.fact.factType.replace(/_/g, " ")}
        </span>
      </div>
      <p className="text-foreground/85 leading-snug">{rule.explanation}</p>
      <p className="text-[11px] text-muted-foreground italic">
        Source: {sourceLabel(rule.fact.source)} ·{" "}
        {rule.fact.sourceSnippet
          ? `"${rule.fact.sourceSnippet.slice(0, 140)}"`
          : `${rule.fact.scopeKind} = ${rule.fact.scopeValue}`}{" "}
        · confidence {Math.round(rule.fact.confidence * 100)}%
      </p>
    </div>
  );
}

export function CrossContamBadge({
  result,
  compact,
}: {
  result: CrossContamItem | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!result) return null;
  const meta = riskMeta(result.risk);
  const Icon = meta.Icon;

  return (
    <div
      className={`rounded-2xl border ${meta.bg} overflow-hidden`}
      data-testid="cross-contam-badge"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 active:scale-[0.99] transition"
        data-testid="button-cross-contam-toggle"
      >
        <Icon className={`w-4 h-4 ${meta.text}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${meta.text}`}>{meta.label}</div>
          {!compact && (
            <div className="text-[11px] text-muted-foreground">
              {result.firedRules.length > 0
                ? `${result.firedRules.length} rule${result.firedRules.length === 1 ? "" : "s"} fired`
                : result.risk === "unknown"
                ? "No kitchen-practice info available"
                : "No cross-contact rules triggered"}
            </div>
          )}
        </div>
        {result.firedRules.length > 0 &&
          (open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          ))}
      </button>
      {open && result.firedRules.length > 0 && (
        <div className="px-3 pb-3 pt-1 space-y-1.5">
          {result.firedRules.map((r, i) => (
            <FiredRuleRow key={i} rule={r} />
          ))}
        </div>
      )}
      {open && result.unknownAllergens.length > 0 && (
        <div className="px-3 pb-3 text-[11px] text-muted-foreground">
          Insufficient info on:{" "}
          <span className="font-medium">{result.unknownAllergens.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

export function ReviewNoteInput({
  onSubmit,
  busy,
}: {
  onSubmit: (text: string) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2 p-3 rounded-2xl border bg-card" data-testid="review-note-input">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Got a kitchen note or review?
      </p>
      <textarea
        className="w-full text-sm rounded-xl border bg-background p-2 min-h-[64px] resize-y"
        placeholder='e.g. "All fried items share oil with breaded shrimp" or "May contain traces of nuts"'
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-testid="textarea-review"
      />
      <button
        type="button"
        disabled={busy || text.trim().length < 8}
        onClick={() => {
          onSubmit(text.trim());
          setText("");
        }}
        className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        data-testid="button-submit-review"
      >
        {busy ? "Re-scoring…" : "Add and re-score"}
      </button>
    </div>
  );
}
