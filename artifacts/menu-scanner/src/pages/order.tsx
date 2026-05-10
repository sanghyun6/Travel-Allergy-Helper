import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useProfile, useCart, useExtraInstructions, useChatThread } from "@/context/store-context";
import { useOrderingInstructionsStream } from "@/hooks/use-ordering-instructions-stream";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowLeftRight, Volume2, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";

export default function OrderPage() {
  const [, setLocation] = useLocation();
  const { profile } = useProfile();
  const { cartItems, menuLanguage, clearCart } = useCart();
  const { extraInstructions } = useExtraInstructions();
  const { clearThread } = useChatThread();

  const ordering = useOrderingInstructionsStream();
  const [ttsLoading, setTtsLoading] = useState(false);
  const startedRef = useRef(false);

  // Bounce back if there's nothing to order.
  useEffect(() => {
    if (cartItems.length === 0) setLocation("/cart");
  }, [cartItems.length, setLocation]);

  const startStream = useCallback(() => {
    if (!profile || !menuLanguage || cartItems.length === 0) return;
    void ordering.start({
      items: cartItems.map((i) => i.name),
      targetLanguage: profile.nativeLanguage,
      restrictions: profile.restrictions,
      menuLanguage,
      extraInstructions: extraInstructions || undefined,
    });
  }, [ordering, profile, menuLanguage, cartItems, extraInstructions]);

  // Auto-start once on mount.
  useEffect(() => {
    if (startedRef.current) return;
    if (!profile || !menuLanguage || cartItems.length === 0) return;
    startedRef.current = true;
    startStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, menuLanguage]);

  const playAudio = useCallback(async (text: string) => {
    if (!menuLanguage || ttsLoading || !text) return;
    setTtsLoading(true);
    try {
      const response = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: menuLanguage }),
      });
      if (!response.ok) throw new Error("TTS request failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      console.error("TTS playback error:", err);
    } finally {
      setTtsLoading(false);
    }
  }, [menuLanguage, ttsLoading]);

  const handleFinishOrder = () => {
    ordering.reset();
    clearCart();
    clearThread();
    setLocation("/camera");
  };

  const sourceLabel = profile?.nativeLanguage || "English";
  const targetLabel = menuLanguage || "Menu";
  const phrase = ordering.state.fullOrderPhrase;
  const isLoading =
    ordering.state.status === "starting" ||
    (ordering.state.status === "streaming" && !phrase);
  const hasError =
    (ordering.state.status === "error" && !phrase) || !!ordering.state.fullOrderError;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col max-w-md mx-auto w-full relative">
      {/* Header */}
      <header className="p-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setLocation("/cart")}
          className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-all"
          data-testid="button-back-to-cart"
          aria-label="Back to cart"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </header>

      {/* Language pill (read-only display) */}
      <div className="px-4">
        <div
          className="mx-auto flex items-center justify-center gap-3 rounded-full bg-white border-2 border-primary/70 shadow-sm h-11 px-5 max-w-xs"
          data-testid="order-language-pill"
        >
          <span className="text-sm font-semibold text-foreground" data-testid="text-source-language">{sourceLabel}</span>
          <ArrowLeftRight className="w-4 h-4 text-primary shrink-0" aria-hidden />
          <span className="text-sm font-semibold text-foreground" data-testid="text-target-language">{targetLabel}</span>
        </div>
      </div>

      {/* Translated phrase card */}
      <div className="flex-1 px-4 mt-4 pb-40">
        <div
          className="w-full min-h-[60dvh] border-2 border-foreground/80 rounded-3xl p-6 flex items-start justify-center bg-card"
          data-testid="order-phrase-card"
        >
          {isLoading && (
            <div className="flex flex-col items-center justify-center w-full py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Translating your order…</span>
            </div>
          )}

          {!isLoading && phrase && (
            <p
              className="text-2xl font-medium leading-snug text-center w-full whitespace-pre-wrap"
              data-testid="text-full-order-phrase"
            >
              {phrase}
            </p>
          )}

          {!isLoading && !phrase && hasError && (
            <div className="flex flex-col items-center justify-center w-full py-16 gap-4 text-center">
              <p className="text-sm text-destructive">
                {ordering.state.fullOrderError || ordering.state.error || "Couldn't generate the order phrase."}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { startedRef.current = true; startStream(); }}
                data-testid="button-retry-order"
              >
                <RefreshCw className="w-4 h-4 mr-1" /> Retry
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Floating speaker button */}
      <button
        type="button"
        onClick={() => playAudio(phrase)}
        disabled={!phrase || ttsLoading}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
        data-testid="button-play-full-phrase"
        aria-label="Play audio"
      >
        {ttsLoading ? (
          <Loader2 className="w-6 h-6 text-primary-foreground animate-spin" />
        ) : (
          <Volume2 className="w-6 h-6 text-primary-foreground" />
        )}
      </button>

      {/* Finish order */}
      <div className="fixed bottom-0 left-0 right-0 z-10 max-w-md mx-auto p-4 bg-gradient-to-t from-background via-background to-transparent pt-8">
        <Button
          size="lg"
          variant="outline"
          className="w-full h-12 rounded-xl border-foreground/30"
          onClick={handleFinishOrder}
          data-testid="button-finish-order"
        >
          <CheckCircle2 className="w-5 h-5 mr-2" /> Finish Order
        </Button>
      </div>
    </div>
  );
}
