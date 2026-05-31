"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

interface ActiveWalletState {
  activeWallet: string | null;
  setActiveWallet: (address: string | null) => void;
}

const ActiveWalletCtx = createContext<ActiveWalletState | undefined>(undefined);

const STORAGE_KEY = "activeWallet";

export function ActiveWalletProvider({ children }: { children: ReactNode }) {
  const [activeWallet, setActiveWalletState] = useState<string | null>(null);

  // The active-wallet selection is purely a UX convenience and is safe to keep
  // client-side (identity itself lives in the httpOnly session cookie).
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setActiveWalletState(stored);
  }, []);

  const setActiveWallet = (address: string | null) => {
    setActiveWalletState(address);
    if (address) localStorage.setItem(STORAGE_KEY, address);
    else localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ActiveWalletCtx.Provider value={{ activeWallet, setActiveWallet }}>
      {children}
    </ActiveWalletCtx.Provider>
  );
}

export function useActiveWallet(): ActiveWalletState {
  const ctx = useContext(ActiveWalletCtx);
  if (!ctx) {
    throw new Error("useActiveWallet must be used within ActiveWalletProvider");
  }
  return ctx;
}
