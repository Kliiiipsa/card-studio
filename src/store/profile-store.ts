"use client";
import { create } from "zustand";

/**
 * Current account + sparks balance for the topbar profile menu.
 * `balance === null` → billing disabled or admin (everything is free).
 * Paid API responses carry a fresh `balance`; client-api pushes it here.
 */
type ProfileState = {
  email: string | null;
  role: "admin" | "user" | null;
  balance: number | null;
  /** пакет исправлений «Фото товара» включён для этого аккаунта (гейт на сервере) */
  photoFix: boolean;
  loaded: boolean;
  fetchMe: () => Promise<void>;
  setBalance: (balance: number) => void;
  reset: () => void;
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  email: null,
  role: null,
  balance: null,
  photoFix: false,
  loaded: false,
  fetchMe: async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) return;
      const data = (await res.json()) as {
        email: string;
        role: "admin" | "user";
        balance: number | null;
        photoFix?: boolean;
      };
      set({
        email: data.email,
        role: data.role,
        balance: data.balance,
        photoFix: !!data.photoFix,
        loaded: true,
      });
    } catch {
      // offline — keep whatever we had
    }
  },
  setBalance: (balance) => {
    if (get().loaded) set({ balance });
  },
  reset: () => set({ email: null, role: null, balance: null, photoFix: false, loaded: false }),
}));
