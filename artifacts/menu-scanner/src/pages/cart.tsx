import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useProfile, useCart, useChatThread } from "@/context/store-context";
import { useGetOrderingInstructions, useSendChatMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Loader2, Trash2, ChevronRight, MessageCircle, Send, ShieldCheck, Volume2, ShoppingBag, X } from "lucide-react";
import { OutcomeButtons } from "@/components/risk-score";

export default function CartPage() {
  const [, setLocation] = useLocation();
  const { profile } = useProfile();
  const { cartItems, menuLanguage, removeFromCart, clearCart } = useCart();
  const { threadId, setThreadId, clearThread } = useChatThread();

  const getInstructions = useGetOrderingInstructions();
  const chat = useSendChatMessage();

  const [chatMessage, setChatMessage] = useState("");
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [ttsLoading, setTtsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chat.isPending]);

  const handleGenerateInstructions = () => {
    if (!profile || !menuLanguage || cartItems.length === 0) return;
    getInstructions.mutate({
      data: {
        items: cartItems.map(i => i.name),
        targetLanguage: profile.nativeLanguage,
        restrictions: profile.restrictions,
        menuLanguage: menuLanguage,
      },
    });
  };

  const playAudio = useCallback(async (text: string) => {
    if (!menuLanguage || ttsLoading) return;
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

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !profile) return;

    const userMsg = chatMessage.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatMessage("");

    const orderingPhrases = getInstructions.data?.instructions.map(i => i.phrase) || [];

    chat.mutate(
      {
        data: {
          message: userMsg,
          threadId: threadId ?? null,
          restrictions: profile.restrictions,
          cartItems: cartItems.map(i => i.name),
          orderingPhrases,
        },
      },
      {
        onSuccess: (data) => {
          setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
          setThreadId(data.threadId);
        },
      }
    );
  };

  const handleClearCart = () => {
    clearCart();
    clearThread();
    getInstructions.reset();
    setMessages([]);
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-[100dvh] pb-20 bg-background flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Your order is empty</h2>
        <p className="text-muted-foreground mb-8">Scan a menu to find safe dishes to order.</p>
        <Button
          size="lg"
          className="rounded-xl h-14 px-8"
          onClick={() => setLocation("/camera")}
          data-testid="button-go-to-scanner"
        >
          Go to Scanner
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-20 bg-background flex flex-col max-w-md mx-auto w-full">
      <header className="p-4 border-b bg-card sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Your Order</h1>
          <p className="text-sm text-muted-foreground">{cartItems.length} item{cartItems.length !== 1 ? "s" : ""}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
          onClick={handleClearCart}
          data-testid="button-clear-cart"
        >
          <X className="w-4 h-4 mr-1" /> Clear all
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {cartItems.map((item, idx) => (
            <div
              key={idx}
              className="p-4 border rounded-xl bg-card space-y-3"
              data-testid={`cart-item-${idx}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 pr-4">
                  <p className="font-bold">{item.translatedName}</p>
                  <p className="text-sm text-muted-foreground">{item.name}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeFromCart(idx)}
                  data-testid={`button-remove-item-${idx}`}
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
              {getInstructions.data && (
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
                  cuisine={menuLanguage}
                />
              )}
            </div>
          ))}
        </div>

        {!getInstructions.data && (
          <div className="p-4">
            <Button
              size="lg"
              className="w-full h-14 text-lg rounded-xl shadow-md"
              onClick={handleGenerateInstructions}
              disabled={getInstructions.isPending}
              data-testid="button-generate-instructions"
            >
              {getInstructions.isPending ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Preparing translation...</>
              ) : (
                <>Generate Ordering Instructions <ChevronRight className="w-5 h-5 ml-1" /></>
              )}
            </Button>
          </div>
        )}

        {getInstructions.data && (
          <div className="p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Full order phrase card */}
            <div className="p-5 bg-primary/10 border border-primary/20 rounded-2xl">
              <div className="flex items-center gap-2 text-primary font-bold mb-3">
                <ShieldCheck className="w-5 h-5" />
                <span>Show this to the waiter</span>
              </div>
              <p className="text-xl font-medium leading-snug" data-testid="text-full-order-phrase">
                {getInstructions.data.fullOrderPhrase}
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full border-primary/30 hover:bg-primary/5 text-primary"
                onClick={() => playAudio(getInstructions.data.fullOrderPhrase)}
                disabled={ttsLoading}
                data-testid="button-play-full-phrase"
              >
                {ttsLoading
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Volume2 className="w-4 h-4 mr-2" />}
                Play Audio
              </Button>
            </div>

            {/* Per-item breakdown */}
            <div className="space-y-3">
              <h3 className="font-bold text-lg px-1">Item Breakdown</h3>
              {getInstructions.data.instructions.map((inst, idx) => (
                <div
                  key={idx}
                  className="p-4 border rounded-xl bg-card space-y-3"
                  data-testid={`instruction-item-${idx}`}
                >
                  <p className="font-bold text-sm text-muted-foreground uppercase tracking-wider">{inst.item}</p>
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
                </div>
              ))}
            </div>

            {/* Chat assistant */}
            <div className="mt-8 border rounded-2xl overflow-hidden bg-card flex flex-col h-[400px]">
              <div className="p-3 border-b bg-muted/50 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                <h3 className="font-bold flex-1">Order Assistant</h3>
                {threadId && (
                  <button
                    onClick={() => { clearThread(); setMessages([]); }}
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
                    Need help tweaking this order? Ask me how to request sauce on the side or double-check an ingredient.
                  </div>
                </div>

                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`} data-testid={`chat-message-${i}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className={`p-3 rounded-2xl text-sm max-w-[85%] ${msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted rounded-tl-sm'}`}>
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
                      <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
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
        )}
      </div>
    </div>
  );
}
