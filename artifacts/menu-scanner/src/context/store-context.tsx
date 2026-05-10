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
  boundingBox?: { ymin: number; xmin: number; ymax: number; xmax: number };
  nameBox?: { ymin: number; xmin: number; ymax: number; xmax: number };
}

export interface HistoryEntry {
  id: string;
  savedAt: number;
  menuLanguage: string;
  items: MenuItem[];
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
  history: HistoryEntry[];
  saveCartToHistory: () => HistoryEntry | null;
  removeHistoryEntry: (id: string) => void;
  clearHistory: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cartItems, setCartItems] = useState<MenuItem[]>([]);
  const [menuLanguage, setMenuLanguageState] = useState<string | null>(null);
  const [threadId, setThreadIdState] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const p = localStorage.getItem("userProfile");
      if (p) setProfileState(JSON.parse(p));
    } catch {}
    try {
      const c = localStorage.getItem("cartItems");
      if (c) setCartItems(JSON.parse(c));
    } catch {}
    try {
      const h = localStorage.getItem("orderHistory");
      if (h) setHistory(JSON.parse(h));
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

  const saveCartToHistory = useCallback<() => HistoryEntry | null>(() => {
    let saved: HistoryEntry | null = null;
    setCartItems((currentCart) => {
      if (currentCart.length === 0) return currentCart;
      const lang = localStorage.getItem("menuLanguage") || "Unknown";
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt: Date.now(),
        menuLanguage: lang,
        items: currentCart,
      };
      saved = entry;
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, 50);
        localStorage.setItem("orderHistory", JSON.stringify(next));
        return next;
      });
      localStorage.removeItem("cartItems");
      localStorage.removeItem("menuLanguage");
      setMenuLanguageState(null);
      return [];
    });
    return saved;
  }, []);

  const removeHistoryEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      localStorage.setItem("orderHistory", JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem("orderHistory");
  }, []);

  return (
    <StoreContext.Provider value={{
      profile, isLoaded, setProfile,
      cartItems, menuLanguage, addToCart, removeFromCart, clearCart,
      threadId, setThreadId, clearThread,
      history, saveCartToHistory, removeHistoryEntry, clearHistory,
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

export function useHistory() {
  const { history, saveCartToHistory, removeHistoryEntry, clearHistory } = useStore();
  return { history, saveCartToHistory, removeHistoryEntry, clearHistory };
}
