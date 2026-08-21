"use client";
import Script from "next/script";

/**
 * Яндекс.Метрика. Включается переменной NEXT_PUBLIC_YM_ID — без неё компонент
 * не рендерит ничего, поэтому в разработке счётчик молчит и статистику не
 * портит.
 *
 * Настройки выбраны под наши документы (политика, п. 10):
 *  - webvisor ВЫКЛЮЧЕН: запись сессии снимала бы то, что человек печатает в
 *    формах (названия товаров, преимущества), — это лишние данные и лишний
 *    риск по 152-ФЗ. Карта кликов и скроллов остаётся;
 *  - trackHash: студия — SPA, переходы между разделами должны считаться;
 *  - fingerprint-технологии не используем (обещано в п. 10.2 политики).
 */
const YM_ID = process.env.NEXT_PUBLIC_YM_ID;

export function YandexMetrica() {
  if (!YM_ID) return null;
  return (
    <>
      <Script id="yandex-metrica" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
          (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

          ym(${YM_ID}, "init", {
            clickmap: true,
            trackLinks: true,
            accurateTrackBounce: true,
            webvisor: false,
            trackHash: true
          });
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://mc.yandex.ru/watch/${YM_ID}`}
          style={{ position: "absolute", left: "-9999px" }}
          alt=""
        />
      </noscript>
    </>
  );
}

/**
 * Отправить цель в Метрику. Безопасно вызывать всегда: если счётчик не
 * подключён, вызов молча ничего не делает.
 */
export function reachGoal(goal: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !YM_ID) return;
  const ym = (window as unknown as { ym?: (...args: unknown[]) => void }).ym;
  try {
    ym?.(Number(YM_ID), "reachGoal", goal, params);
  } catch {
    // аналитика никогда не должна ломать основной сценарий
  }
}

/** Цели, которые считаем: воронка от регистрации до оплаты. */
export const GOALS = {
  register: "REGISTER",
  topupStart: "TOPUP_START",
  topupSuccess: "TOPUP_SUCCESS",
  generation: "GENERATION",
  promo: "PROMO_REDEEM",
} as const;
