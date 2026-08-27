"use client";

/**
 * Клиентская атрибуция (first-touch). На заходе с рекламной ссылки (в URL есть
 * utm_*) запоминаем ПЕРВЫЙ источник в localStorage и больше не перезаписываем —
 * даже если человек зарегистрируется позже и с другой страницы. При регистрации
 * это отправляется на сервер (см. register), чтобы видеть CAC по каналам.
 */
export type StoredAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  landing?: string;
  referrer?: string;
  ts?: number;
};

const KEY = "kartogen_attr";

/** Вызывается на каждой странице; пишет источник только если его ещё нет. */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(KEY)) return; // first-touch уже зафиксирован
    const q = new URLSearchParams(window.location.search);
    const g = (k: string) => q.get(k) || undefined;
    const source = g("utm_source");
    const medium = g("utm_medium");
    const campaign = g("utm_campaign");
    const referrer = document.referrer || undefined;
    // Записываем, только если есть рекламная метка или внешний реферер —
    // прямой заход без источника не засоряем.
    if (!source && !medium && !campaign && !referrer) return;
    const attr: StoredAttribution = {
      source,
      medium,
      campaign,
      content: g("utm_content"),
      term: g("utm_term"),
      landing: window.location.pathname,
      referrer,
      ts: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(attr));
  } catch {
    // приватный режим / заблокированный storage — просто пропускаем
  }
}

/** Прочитать сохранённый источник (для тела запроса регистрации). */
export function getAttribution(): StoredAttribution | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const a = JSON.parse(raw) as StoredAttribution;
    return a && typeof a === "object" ? a : undefined;
  } catch {
    return undefined;
  }
}
