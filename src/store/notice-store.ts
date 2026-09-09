"use client";
import { create } from "zustand";

/**
 * Уведомления сервиса — общий источник для колокольчика и для полосы под
 * шапкой. Один запрос на страницу: два компонента показывают одни и те же
 * данные, и «прочитано» в одном месте гасит и второе.
 */

export type Notice = {
  id: number;
  kind: "info" | "promo" | "maintenance";
  title: string;
  body: string;
  url: string | null;
  /** показывать полосой во всю ширину под шапкой — для важного */
  banner: boolean;
  createdAt: string;
  read: boolean;
};

type NoticeState = {
  notices: Notice[];
  loaded: boolean;
  fetchNotices: () => Promise<void>;
  markRead: (ids: number[]) => Promise<void>;
};

export const useNoticeStore = create<NoticeState>((set, get) => ({
  notices: [],
  loaded: false,
  fetchNotices: async () => {
    try {
      const res = await fetch("/api/notices");
      if (!res.ok) return;
      const data = (await res.json()) as { notices?: Notice[] };
      set({ notices: data.notices ?? [], loaded: true });
    } catch {
      // шапка не должна падать из-за уведомлений
    }
  },
  markRead: async (ids) => {
    if (!ids.length) return;
    // гасим сразу, не дожидаясь сервера
    set({ notices: get().notices.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) });
    await fetch("/api/notices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => undefined);
  },
}));
