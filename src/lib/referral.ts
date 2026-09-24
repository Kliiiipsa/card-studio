"use client";

/**
 * Клиентская часть реферальной программы. Человек заходит по ссылке
 * kartogen.ru/r/CODE, сервер редиректит на главную с ?ref=CODE — здесь код
 * запоминается в localStorage и в cookie и отправляется при регистрации.
 *
 * First-touch, как и у UTM-атрибуции: первый пригласивший не перезаписывается,
 * иначе друг, который потом кликнул чужую ссылку, «перешёл» бы к другому.
 * Cookie нужна для входа через Яндекс ID: там регистрация идёт server-side и
 * localStorage серверу не виден.
 */

const KEY = "kartogen_ref";
export const REF_COOKIE = "kg_ref";

/** Вызывается на каждой странице; пишет код только если его ещё нет. */
export function captureReferral(): void {
  if (typeof window === "undefined") return;
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (!code) return;
    const clean = code.trim().toUpperCase().slice(0, 12);
    if (!/^[A-Z0-9]{4,12}$/.test(clean)) return;
    if (localStorage.getItem(KEY)) return; // first-touch уже зафиксирован
    localStorage.setItem(KEY, clean);
    document.cookie = `${REF_COOKIE}=${clean}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  } catch {
    // приватный режим / заблокированный storage — просто пропускаем
  }
}

/** Код пригласившего для тела запроса регистрации. */
export function getReferral(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}
