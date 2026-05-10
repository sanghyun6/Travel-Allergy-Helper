import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useProfile, useCart, useExtraInstructions, useChatThread } from "@/context/store-context";
import { useOrderingInstructionsStream } from "@/hooks/use-ordering-instructions-stream";
import { useSendChatMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Play,
  Loader2,
  MessageCircle,
  Send,
  ShieldCheck,
  Volume2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export default function OrderPage() {
  const [, setLocation] = useLocation();
  const { profile } = useProfile();
  const { cartItems, menuLanguage, clearCart } = useCart();
  const { extraInstructions } = useExtraInstructions();
  const { threadId, setThreadId, clearThread } = useChatThread();

  const ordering = useOrderingInstructionsStream();
  const chat = useSendChatMessage();

  const orderedInstructions = useMemo(() => {
    return Array.from(ordering.state.instructions.entries())
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v);
  }, [ordering.state.instructions]);

  const isStreaming =
    ordering.state.status === "starting" || ordering.state.status === "streaming";

  const [chatMessage, setChatMessage] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [ttsLoading, setTtsLoading] = useState(false);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bounce back if there's nothing to order.
  useEffect(() => {
    if (cartItems.length === 0) setLocation("/cart");
  }, [cartItems.length, setLocation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chat.isPending]);

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

  const playAudio = useCallback(
    async (text: string) => {
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
    },
    [menuLanguage, ttsLoading],
  );

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !profile) return;
    const userMsg = chatMessage.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatMessage("");
    const orderingPhrases = orderedInstructions.map((i) => i.phrase);
    chat.mutate(
      {
        data: {
          message: userMsg,
          threadId: threadId ?? null,
          restrictions: profile.restrictions,
          cartItems: cartItems.map((i) => i.name),
          orderingPhrases,
        },
      },
      {
        onSuccess: (data) => {
          setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
          setThreadId(data.threadId);
        },
      },
    );
  };

  const handleFinishOrder = () => {
    ordering.reset();
    clearCart();
    clearThread();
    setLocation("/camera");
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col max-w-md mx-auto w-full pb-28">
      <header className="p-4 flex items-center gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur">
        <button
          type="button"
          onClick={() => setLocation("/cart")}
          className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-all"
          data-testid="button-back-to-cart"
          aria-label="Back to cart"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Your Order</h1>
          <p className="text-sm text-muted-foreground">
            {cartItems.length} item{cartItems.length !== 1 ? "s" : ""}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Full order phrase card */}
          <div className="p-5 bg-primary/10 border border-primary/20 rounded-2xl">
            <div className="flex items-center gap-2 text-primary font-bold mb-3">
              <ShieldCheck className="w-5 h-5" />
              <span>Show this to the waiter</span>
              {isStreaming && !ordering.state.fullOrderPhrase && (
                <Loader2 className="w-4 h-4 animate-spin ml-auto" />
              )}
            </div>
            {ordering.state.fullOrderPhrase ? (
              <>
                <p className="text-xl font-medium leading-snug" data-testid="text-full-order-phrase">
                  {ordering.state.fullOrderPhrase}
                </p>
                <Button
                  variant="outline"
                  className="mt-4 w-full border-primary/30 hover:bg-primary/5 text-primary"
                  onClick={() => playAudio(ordering.state.fullOrderPhrase)}
                  disabled={ttsLoading}
                  data-testid="button-play-full-phrase"
                >
                  {ttsLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Volume2 className="w-4 h-4 mr-2" />
                  )}
                  Play Audio
                </Button>
              </>
            ) : ordering.state.fullOrderError ? (
              <p className="text-sm text-destructive">
                Couldn't compose the combined phrase. {ordering.state.fullOrderError}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="h-6 bg-primary/20 rounded animate-pulse" />
                <div className="h-6 bg-primary/15 rounded animate-pulse w-4/5" />
              </div>
            )}
          </div>

          {/* Per-item breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-bold text-lg">Item Breakdown</h3>
              {isStreaming && (
                <span
                  className="text-xs text-muted-foreground flex items-center gap-1"
                  data-testid="text-translation-progress"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {ordering.state.instructions.size} of {ordering.state.total} translated
                </span>
              )}
            </div>

            {ordering.state.status === "error" && ordering.state.error && (
              <div
                className="p-3 border border-destructive/30 bg-destructive/10 rounded-xl flex items-center gap-3"
                data-testid="ordering-stream-error"
              >
                <span className="text-sm text-destructive flex-1">{ordering.state.error}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    startedRef.current = true;
                    startStream();
                  }}
                  data-testid="button-retry-ordering"
                >
                  <RefreshCw className="w-4 h-4 mr-1" /> Retry
                </Button>
              </div>
            )}

            {ordering.state.snapshotItems.map((snapshotName, idx) => {
              const inst = ordering.state.instructions.get(idx);
              const failure = ordering.state.itemErrors.get(idx);
              return (
                <div
                  key={idx}
                  className="p-4 border rounded-xl bg-card space-y-3"
                  data-testid={`instruction-item-${idx}`}
                >
                  <p className="font-bold text-sm text-muted-foreground uppercase tracking-wider">
                    {inst?.item ?? snapshotName}
                  </p>
                  {inst ? (
                    <>
                      <p className="text-lg font-medium">{inst.phrase}</p>
                      <div className="flex items-center justify-between pt-2 border-t border-dashed">
                        <p className="text-sm text-muted-foreground italic">"{inst.pronunciation}"</p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-primary"
                          onClick={() => playAudio(inst.phrase)}
                          data-testid={`button-play-phrase-${idx}`}
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </Button>
                      </div>
                    </>
                  ) : failure ? (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <RefreshCw className="w-4 h-4" />
                      <span>Couldn't translate this item. {failure.message}</span>
                    </div>
                  ) : (
                    <div className="space-y-2" data-testid={`instruction-item-${idx}-loading`}>
                      <div className="h-5 bg-muted rounded animate-pulse" />
                      <div className="h-4 bg-muted rounded animate-pulse w-3/5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Chat assistant */}
          <div className="mt-8 border rounded-2xl overflow-hidden bg-card flex flex-col h-[400px]">
            <div className="p-3 border-b bg-muted/50 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              <h3 className="font-bold flex-1">Order Assistant</h3>
              {threadId && (
                <button
                  onClick={() => {
                    clearThread();
                    setMessages([]);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-thread"
                >
                  New chat
                </button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-muted p-3 rounded-2xl rounded-tl-sm text-sm">
                  Need help tweaking this order? Ask me how to request sauce on the side or
                  double-check an ingredient.
                </div>
              </div>

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  data-testid={`chat-message-${i}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`p-3 rounded-2xl text-sm max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {chat.isPending && (
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  </div>
                  <div className="bg-muted p-3 rounded-2xl rounded-tl-sm text-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" />
                    <span
                      className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    />
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={sendChat} className="p-2 border-t bg-background flex gap-2">
              <Input
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Ask a question..."
                className="flex-1 rounded-full border-muted-foreground/20 focus-visible:ring-primary h-10"
                disabled={chat.isPending}
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                size="icon"
                className="rounded-full shrink-0 h-10 w-10"
                disabled={!chatMessage.trim() || chat.isPending}
                data-testid="button-send-chat"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Finish order */}
      <div className="fixed bottom-0 left-0 right-0 z-10 max-w-md mx-auto p-4 bg-gradient-to-t from-background via-background to-transparent pt-8">
        <Button
          size="lg"
          className="w-full h-12 rounded-xl"
          onClick={handleFinishOrder}
          data-testid="button-finish-order"
        >
          <CheckCircle2 className="w-5 h-5 mr-2" /> Finish Order
        </Button>
      </div>
    </div>
  );
}
