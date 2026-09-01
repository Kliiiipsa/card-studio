"use client";
import * as React from "react";
import { reachGoal, GOALS } from "./yandex-metrica";

/**
 * Колбэк входа через Яндекс ID редиректит НОВОГО пользователя на
 * /dashboard?welcome=1. Server-side колбэк сам Метрику дёрнуть не может,
 * поэтому цель «Регистрация» отправляем здесь, на клиенте, увидев флаг —
 * и сразу чистим URL, чтобы при перезагрузке цель не задвоилась.
 */
export function OAuthRegisterPing() {
  React.useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("welcome") === "1") {
        reachGoal(GOALS.register, { method: "yandex" });
        u.searchParams.delete("welcome");
        window.history.replaceState({}, "", u.pathname + u.search + u.hash);
      }
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
