import { useState } from "react";
import type { CitationChain, CitationLink } from "@workspace/api-client-react";
import { ChevronDown, ChevronRight, ExternalLink, BookOpen } from "lucide-react";

function relationLabel(rel: string): string {
  switch (rel) {
    case "contains":     return "contains";
    case "derived_from": return "derived from";
    case "is_a":         return "is a";
    case "made_with":    return "made with";
    case "may_contain":  return "may contain";
    default:             return rel.replace(/_/g, " ");
  }
}

function ChainSummary({ chain }: { chain: CitationChain }) {
  // Render a one-line "A → contains → B → derived from → C → flagged for X"
  const parts: string[] = [];
  for (const link of chain.links) {
    if (link.kind === "ingredient" && link.ingredient) {
      parts.push(link.ingredient.name);
    } else if (link.kind === "relation") {
      parts.push(`→ ${relationLabel(link.relation ?? "")} →`);
    } else if (link.kind === "allergen" && link.allergen) {
      parts.push(`flagged: ${link.allergen.name}`);
    }
  }
  return (
    <span className="text-xs text-foreground/85 leading-snug">
      {parts.join(" ")}
    </span>
  );
}

function NodeDetail({ link }: { link: CitationLink }) {
  if (link.kind === "ingredient" && link.ingredient) {
    const ing = link.ingredient;
    return (
      <div className="text-xs space-y-1.5 py-2 px-3 bg-background rounded-lg border">
        <div className="font-semibold text-sm">{ing.name}</div>
        {ing.description && (
          <div className="text-muted-foreground">{ing.description}</div>
        )}
        {ing.aliases.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {ing.aliases.slice(0, 8).map((a, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded bg-muted text-foreground/80"
                title={a.language}
              >
                {a.alias}
              </span>
            ))}
          </div>
        )}
        {ing.sourceUrl && (
          <a
            href={ing.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline pt-1"
          >
            <ExternalLink className="w-3 h-3" /> {ing.source}
          </a>
        )}
      </div>
    );
  }
  if (link.kind === "relation") {
    return (
      <div className="text-[11px] italic text-muted-foreground pl-3">
        ↳ {relationLabel(link.relation ?? "")}
        {link.note ? ` — ${link.note}` : ""}
      </div>
    );
  }
  if (link.kind === "allergen" && link.allergen) {
    return (
      <div className="text-xs py-2 px-3 bg-red-500/10 text-red-700 rounded-lg border border-red-300/40">
        Flagged allergen: <span className="font-semibold">{link.allergen.name}</span>
        {link.allergen.category && (
          <span className="text-muted-foreground"> · {link.allergen.category}</span>
        )}
      </div>
    );
  }
  return null;
}

function ChainCard({ chain }: { chain: CitationChain }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2 p-3 text-left hover:bg-muted/40 active:scale-[0.99] transition"
        data-testid="button-citation-toggle"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            “{chain.sourceText}” → {chain.allergen.name}
          </div>
          <ChainSummary chain={chain} />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-1.5">
          {chain.links.map((link, i) => (
            <NodeDetail key={i} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CitationChainList({ chains }: { chains: CitationChain[] }) {
  if (!chains || chains.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <BookOpen className="w-3.5 h-3.5" />
        Why this was flagged
      </div>
      {chains.map((c, i) => (
        <ChainCard key={i} chain={c} />
      ))}
    </div>
  );
}
