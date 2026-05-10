import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";

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
  extraInstructions: string;
  setExtraInstructions: (s: string) => void;
  history: HistoryEntry[];
  historyLoading: boolean;
  historyError: string | null;
  refreshHistory: () => Promise<void>;
  removeHistoryEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  reorderFromHistory: (entry: HistoryEntry) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

function getDeviceId(): string {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("deviceId", id);
  }
  return id;
}

function newSessionId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cartItems, setCartItems] = useState<MenuItem[]>([]);
  const [menuLanguage, setMenuLanguageState] = useState<string | null>(null);
  const [threadId, setThreadIdState] = useState<string | null>(null);
  const [extraInstructions, setExtraInstructionsState] = useState<string>("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const upsertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef<string>("");

  useEffect(() => {
    deviceIdRef.current = getDeviceId();
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
    const ei = localStorage.getItem("extraInstructions");
    if (ei) setExtraInstructionsState(ei);
    const sid = localStorage.getItem("currentSessionId");
    if (sid) sessionIdRef.current = sid;
    setIsLoaded(true);
  }, []);

  const setProfile = useCallback((p: UserProfile) => {
    localStorage.setItem("userProfile", JSON.stringify(p));
    setProfileState(p);
  }, []);

  const persistSession = useCallback((items: MenuItem[], language: string | null) => {
    if (upsertTimerRef.current) clearTimeout(upsertTimerRef.current);
    upsertTimerRef.current = setTimeout(() => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const lang = language || "Unknown";
      fetch(`${API_BASE}/history/upsert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceIdRef.current,
        },
        body: JSON.stringify({ sessionId, menuLanguage: lang, items }),
      }).catch((err) => {
        console.error("history upsert failed", err);
      });
    }, 350);
  }, []);

  const addToCart = useCallback((item: MenuItem, language: string) => {
    if (!sessionIdRef.current) {
      const sid = newSessionId();
      sessionIdRef.current = sid;
      localStorage.setItem("currentSessionId", sid);
    }
    setCartItems((prev) => {
      const next = [...prev, item];
      localStorage.setItem("cartItems", JSON.stringify(next));
      persistSession(next, language);
      return next;
    });
    setMenuLanguageState(language);
    localStorage.setItem("menuLanguage", language);
  }, [persistSession]);

  const removeFromCart = useCallback((index: number) => {
    setCartItems((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      localStorage.setItem("cartItems", JSON.stringify(next));
      const lang = next.length > 0 ? localStorage.getItem("menuLanguage") : null;
      persistSession(next, lang);
      if (next.length === 0) {
        setMenuLanguageState(null);
        setExtraInstructionsState("");
        localStorage.removeItem("menuLanguage");
        localStorage.removeItem("extraInstructions");
        sessionIdRef.current = null;
        localStorage.removeItem("currentSessionId");
      }
      return next;
    });
  }, [persistSession]);

  const clearCart = useCallback(() => {
    persistSession([], null);
    setCartItems([]);
    setMenuLanguageState(null);
    setExtraInstructionsState("");
    localStorage.removeItem("cartItems");
    localStorage.removeItem("menuLanguage");
    localStorage.removeItem("extraInstructions");
    sessionIdRef.current = null;
    localStorage.removeItem("currentSessionId");
  }, [persistSession]);

  const setThreadId = useCallback((id: string) => {
    localStorage.setItem("chatThreadId", id);
    setThreadIdState(id);
  }, []);

  const clearThread = useCallback(() => {
    localStorage.removeItem("chatThreadId");
    setThreadIdState(null);
  }, []);

  const setExtraInstructions = useCallback((s: string) => {
    localStorage.setItem("extraInstructions", s);
    setExtraInstructionsState(s);
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`${API_BASE}/history`, {
        headers: { "x-device-id": deviceIdRef.current },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistory(Array.isArray(data?.entries) ? data.entries : []);
    } catch (err) {
      console.error("refreshHistory error", err);
      setHistoryError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const removeHistoryEntry = useCallback(async (id: string) => {
    setHistory((prev) => prev.filter((e) => e.id !== id));
    try {
      await fetch(`${API_BASE}/history/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-device-id": deviceIdRef.current },
      });
    } catch (err) {
      console.error("removeHistoryEntry error", err);
    }
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    try {
      await fetch(`${API_BASE}/history`, {
        method: "DELETE",
        headers: { "x-device-id": deviceIdRef.current },
      });
    } catch (err) {
      console.error("clearHistory error", err);
    }
  }, []);

  const reorderFromHistory = useCallback((entry: HistoryEntry) => {
    // Adopt the historical sessionId so further edits update the same doc
    sessionIdRef.current = entry.id;
    localStorage.setItem("currentSessionId", entry.id);
    localStorage.setItem("cartItems", JSON.stringify(entry.items));
    localStorage.setItem("menuLanguage", entry.menuLanguage);
    setCartItems(entry.items);
    setMenuLanguageState(entry.menuLanguage);
    persistSession(entry.items, entry.menuLanguage);
  }, [persistSession]);

  return (
    <StoreContext.Provider value={{
      profile, isLoaded, setProfile,
      cartItems, menuLanguage, addToCart, removeFromCart, clearCart,
      threadId, setThreadId, clearThread,
      extraInstructions, setExtraInstructions,
      history, historyLoading, historyError,
      refreshHistory, removeHistoryEntry, clearHistory, reorderFromHistory,
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

export function useExtraInstructions() {
  const { extraInstructions, setExtraInstructions } = useStore();
  return { extraInstructions, setExtraInstructions };
}

export function useHistory() {
  const {
    history, historyLoading, historyError,
    refreshHistory, removeHistoryEntry, clearHistory, reorderFromHistory,
  } = useStore();
  return {
    history, historyLoading, historyError,
    refreshHistory, removeHistoryEntry, clearHistory, reorderFromHistory,
  };
}
