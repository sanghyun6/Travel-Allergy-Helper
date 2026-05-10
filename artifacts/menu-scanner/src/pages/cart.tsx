import { useLocation } from "wouter";
import { useCart, useExtraInstructions } from "@/context/store-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Trash2, ShoppingBag, ChevronRight } from "lucide-react";

export default function CartPage() {
  const [, setLocation] = useLocation();
  const { cartItems, removeFromCart, clearCart } = useCart();
  const { extraInstructions, setExtraInstructions } = useExtraInstructions();

  if (cartItems.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col max-w-md mx-auto w-full">
        <header className="p-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLocation("/camera")}
            className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-all"
            data-testid="button-back-to-camera"
            aria-label="Back to camera"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
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
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col max-w-md mx-auto w-full">
      <header className="px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur">
        <button
          type="button"
          onClick={() => setLocation("/camera")}
          className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-all"
          data-testid="button-back-to-camera"
          aria-label="Back to camera"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Your Order</h1>
          <p className="text-sm text-muted-foreground">{cartItems.length} item{cartItems.length !== 1 ? "s" : ""}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
          onClick={clearCart}
          data-testid="button-clear-cart"
        >
          Clear all
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-32 space-y-4">
        <div className="space-y-3">
          {cartItems.map((item, idx) => (
            <div
              key={idx}
              className="p-4 border rounded-xl bg-card flex items-center justify-between"
              data-testid={`cart-item-${idx}`}
            >
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
          ))}
        </div>

        <div className="space-y-2">
          <label htmlFor="extra-instructions" className="text-sm font-semibold text-foreground px-1">
            Additional instructions
          </label>
          <Textarea
            id="extra-instructions"
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
            placeholder="Anything else to add to the order? (e.g. no onions, sauce on the side, extra spicy)"
            className="min-h-[120px] rounded-xl resize-none"
            data-testid="input-extra-instructions"
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 max-w-md mx-auto p-4 bg-gradient-to-t from-background via-background to-transparent pt-8">
        <Button
          size="lg"
          className="w-full h-14 text-lg rounded-xl shadow-md bg-primary hover:bg-primary/90"
          onClick={() => setLocation("/order")}
          data-testid="button-go-to-order"
        >
          Go to Order <ChevronRight className="w-5 h-5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
