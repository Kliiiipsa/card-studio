"use client";
import * as React from "react";

/**
 * Кнопки соцвхода под формой регистрации/входа. Показываются только когда
 * сервер реально настроен (флаг из /api/auth/config), чтобы не вести на битую
 * кнопку. Соцвход убирает пароль и код с почты — главное лекарство от того,
 * что холодный трафик отваливается на регистрации.
 */
export function OAuthButtons() {
  const [yandex, setYandex] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d: { yandexOauth?: boolean }) => setYandex(d.yandexOauth === true))
      .catch(() => undefined);
  }, []);

  if (!yandex) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-muted-foreground">или</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* full-page navigation обязателен для OAuth-редиректа — это <a>, не роутер */}
      <a
        href="/api/auth/oauth/yandex/start"
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md border bg-card text-sm font-medium transition-colors hover:bg-accent"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#fc3f1d] text-[13px] font-bold text-white">
          Я
        </span>
        Войти с Яндекс ID
      </a>

      <p className="text-center text-[11px] leading-4 text-muted-foreground">
        Нажимая «Войти с Яндекс ID», вы принимаете{" "}
        <a href="/terms" target="_blank" className="text-primary hover:underline">
          Соглашение
        </a>{" "}
        и{" "}
        <a href="/privacy" target="_blank" className="text-primary hover:underline">
          Политику
        </a>
        .
      </p>
    </div>
  );
}
