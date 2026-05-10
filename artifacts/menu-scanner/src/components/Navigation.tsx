import { Link, useLocation } from "wouter";
import { Camera, ShoppingBag, Settings } from "lucide-react";
import { useCart } from "@/hooks/use-store";

export function BottomNav() {
  const [location] = useLocation();
  const { cartItems } = useCart();
  
  if (location === "/" || location === "/onboarding") return null;

  const links = [
    { href: "/camera", icon: Camera, label: "Scan" },
    { href: "/cart", icon: ShoppingBag, label: "Order", badge: cartItems.length > 0 ? cartItems.length : null },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-background/80 backdrop-blur-xl z-50 pb-safe">
      <nav className="flex items-center justify-around h-16 max-w-md mx-auto px-4">
        {links.map((link) => {
          const isActive = location === link.href;
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className="relative flex flex-col items-center justify-center w-16 h-full text-muted-foreground hover:text-foreground transition-colors">
              <div className={`flex flex-col items-center gap-1 ${isActive ? 'text-primary' : ''}`}>
                <div className="relative">
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  {link.badge !== null && link.badge !== undefined && (
                    <span className="absolute -top-1.5 -right-2 bg-primary text-primary-foreground text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center">
                      {link.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{link.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
