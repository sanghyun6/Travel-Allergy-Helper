import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useHistory, useCart, type HistoryEntry } from "@/context/store-context";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, XCircle, RotateCcw, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OutcomeButtons } from "@/components/risk-score";

function safetyIcon(level: string) {
  if (level === "safe") return <ShieldCheck className="w-4 h-4 text-green-600" />;
  if (level === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-red-600" />;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const [, setLocation] = useLocation();
  const {
    history, historyLoading, historyError,
    refreshHistory, removeHistoryEntry, clearHistory, reorderFromHistory,
  } = useHistory();
  const { cartItems } = useCart();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const reorder = (entry: HistoryEntry) => {
    if (cartItems.length > 0) {
      toast({
        title: "Your cart isn't empty",
        description: "Clear your current order before reloading a saved one.",
        variant: "destructive",
      });
      return;
    }
    reorderFromHistory(entry);
    toast({ title: "Loaded into cart", description: `${entry.items.length} item${entry.items.length !== 1 ? "s" : ""} restored.` });
    setLocation("/cart");
  };

  if (historyLoading && history.length === 0) {
    return (
      <div className="min-h-[100dvh] pb-20 bg-background flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="min-h-[100dvh] pb-20 bg-background flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
          <Clock className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">No saved orders yet</h2>
        <p className="text-muted-foreground mb-8">
          {historyError ? "Couldn't load your history. Pull to retry." : "Anything you add to your cart will be saved here automatically."}
        </p>
        <Button size="lg" className="rounded-xl h-14 px-8" onClick={() => setLocation("/camera")}>
          Scan a Menu
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-20 bg-background flex flex-col max-w-md mx-auto w-full">
      <header className="p-4 border-b bg-card sticky top-0 z-10 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/camera")}
            className="p-1.5 rounded-full hover:bg-muted"
            data-testid="button-back-to-camera"
            aria-label="Back to camera"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">History</h1>
            <p className="text-sm text-muted-foreground">{history.length} saved order{history.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
          onClick={() => {
            if (confirm("Delete all saved orders? This can't be undone.")) clearHistory();
          }}
          data-testid="button-clear-history"
        >
          Clear all
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {history.map((entry) => {
          const isOpen = expanded === entry.id;
          const danger = entry.items.filter((i) => i.safetyLevel === "danger").length;
          const warn = entry.items.filter((i) => i.safetyLevel === "warning").length;
          const safe = entry.items.filter((i) => i.safetyLevel === "safe").length;
          return (
            <div
              key={entry.id}
              className="border rounded-xl bg-card overflow-hidden"
              data-testid={`history-entry-${entry.id}`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : entry.id)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(entry.savedAt)}</span>
                    <span>·</span>
                    <span>{entry.menuLanguage}</span>
                  </div>
                  <p className="font-bold truncate">
                    {entry.items.length} item{entry.items.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {safe > 0 && <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-green-600" />{safe}</span>}
                    {warn > 0 && <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" />{warn}</span>}
                    {danger > 0 && <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-600" />{danger}</span>}
                  </div>
                </div>
                {isOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0 ml-2" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0 ml-2" />}
              </button>

              {isOpen && (
                <div className="border-t bg-muted/20">
                  <ul className="divide-y">
                    {entry.items.map((item, idx) => (
                      <li key={idx} className="p-3 space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">{safetyIcon(item.safetyLevel)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{item.translatedName}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.name}</p>
                          </div>
                        </div>
                        <OutcomeButtons
                          compact
                          dish={{
                            name: item.name,
                            translatedName: item.translatedName,
                            description: item.description,
                            ingredients: [],
                            allergenFlags: item.allergenFlags ?? [],
                            conflictingRestrictions: item.conflictingRestrictions ?? [],
                            citations: [],
                          }}
                          cuisine={entry.menuLanguage}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="p-3 flex gap-2 border-t bg-background">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-lg"
                      onClick={() => reorder(entry)}
                      data-testid={`button-reorder-${entry.id}`}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" /> Reload to cart
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeHistoryEntry(entry.id)}
                      data-testid={`button-remove-history-${entry.id}`}
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
