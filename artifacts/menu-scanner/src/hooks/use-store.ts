import { useState, useEffect } from 'react';

export interface UserProfile {
  restrictions: string[];
  nativeLanguage: string;
}

export function useProfile() {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('userProfile');
    if (stored) {
      try {
        setProfileState(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse profile", e);
      }
    }
    setIsLoaded(true);
  }, []);

  const setProfile = (newProfile: UserProfile) => {
    localStorage.setItem('userProfile', JSON.stringify(newProfile));
    setProfileState(newProfile);
  };

  return { profile, setProfile, isLoaded };
}

export interface MenuItem {
  name: string;
  translatedName: string;
  description: string;
  safetyLevel: "safe" | "warning" | "danger";
  conflictingRestrictions: string[];
  allergenFlags: { name: string; severity: string }[];
}

export function useCart() {
  const [cartItems, setCartItems] = useState<MenuItem[]>([]);
  const [menuLanguage, setMenuLanguage] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('cartItems');
    if (stored) {
      try { setCartItems(JSON.parse(stored)); } catch {}
    }
    const storedLang = localStorage.getItem('menuLanguage');
    if (storedLang) setMenuLanguage(storedLang);
  }, []);

  const addToCart = (item: MenuItem, language: string) => {
    const newItems = [...cartItems, item];
    setCartItems(newItems);
    setMenuLanguage(language);
    localStorage.setItem('cartItems', JSON.stringify(newItems));
    localStorage.setItem('menuLanguage', language);
  };

  const removeFromCart = (index: number) => {
    const newItems = [...cartItems];
    newItems.splice(index, 1);
    setCartItems(newItems);
    localStorage.setItem('cartItems', JSON.stringify(newItems));
    if (newItems.length === 0) {
      setMenuLanguage(null);
      localStorage.removeItem('menuLanguage');
    }
  };

  const clearCart = () => {
    setCartItems([]);
    setMenuLanguage(null);
    localStorage.removeItem('cartItems');
    localStorage.removeItem('menuLanguage');
  };

  return { cartItems, menuLanguage, addToCart, removeFromCart, clearCart };
}

export function useChatThread() {
  const [threadId, setThreadIdState] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('chatThreadId');
    if (stored) setThreadIdState(stored);
  }, []);

  const setThreadId = (id: string) => {
    localStorage.setItem('chatThreadId', id);
    setThreadIdState(id);
  };

  const clearThread = () => {
    localStorage.removeItem('chatThreadId');
    setThreadIdState(null);
  };

  return { threadId, setThreadId, clearThread };
}
