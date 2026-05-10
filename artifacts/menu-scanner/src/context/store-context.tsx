import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface UserProfile {
  restrictions: string[];
  nativeLanguage: string;
}

export interface MenuItem {
  name: string;
  translatedName: string;
  description: string;
  safetyLevel: "safe" | "warning" | "danger";
  conflictingRestrictions: string[];
  allergenFlags: { name: string; severity: string }[];
}

interface StoreContextValue {
  profile: UserProfile | null;
  isLoaded: boolean;
  setProfile: (p: UserProfile) => void;
  cartItems: MenuItem[];
  menuLanguage: string | null;
  addToCart: (item: MenuItem, language: string) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  threadId: string | null;
  setThreadId: (id: string) => void;
  clearThread: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cartItems, setCartItems] = useState<MenuItem[]>([]);
  const [menuLanguage, setMenuLanguageState] = useState<string | null>(null);
  const [threadId, setThreadIdState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const p = localStorage.getItem("userProfile");
      if (p) setProfileState(JSON.parse(p));
    } catch {}
    try {
      const c = localStorage.getItem("cartItems");
      if (c) setCartItems(JSON.parse(c));
    } catch {}
    const lang = localStorage.getItem("menuLanguage");
    if (lang) setMenuLanguageState(lang);
    const tid = localStorage.getItem("chatThreadId");
    if (tid) setThreadIdState(tid);
    setIsLoaded(true);
  }, []);

  const setProfile = useCallback((p: UserProfile) => {
    localStorage.setItem("userProfile", JSON.stringify(p));
    setProfileState(p);
  }, []);

  const addToCart = useCallback((item: MenuItem, language: string) => {
    setCartItems(prev => {
      const next = [...prev, item];
      localStorage.setItem("cartItems", JSON.stringify(next));
      return next;
    });
    setMenuLanguageState(language);
    localStorage.setItem("menuLanguage", language);
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setCartItems(prev => {
      const next = [...prev];
      next.splice(index, 1);
      localStorage.setItem("cartItems", JSON.stringify(next));
      if (next.length === 0) {
        setMenuLanguageState(null);
        localStorage.removeItem("menuLanguage");
      }
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setMenuLanguageState(null);
    localStorage.removeItem("cartItems");
    localStorage.removeItem("menuLanguage");
  }, []);

  const setThreadId = useCallback((id: string) => {
    localStorage.setItem("chatThreadId", id);
    setThreadIdState(id);
  }, []);

  const clearThread = useCallback(() => {
    localStorage.removeItem("chatThreadId");
    setThreadIdState(null);
  }, []);

  return (
    <StoreContext.Provider value={{
      profile, isLoaded, setProfile,
      cartItems, menuLanguage, addToCart, removeFromCart, clearCart,
      threadId, setThreadId, clearThread,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function useProfile() {
  const { profile, isLoaded, setProfile } = useStore();
  return { profile, isLoaded, setProfile };
}

export function useCart() {
  const { cartItems, menuLanguage, addToCart, removeFromCart, clearCart } = useStore();
  return { cartItems, menuLanguage, addToCart, removeFromCart, clearCart };
}

export function useChatThread() {
  const { threadId, setThreadId, clearThread } = useStore();
  return { threadId, setThreadId, clearThread };
}
