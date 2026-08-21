"use client";
import * as React from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

/**
 * Яндекс.Метрика. Включается переменной NEXT_PUBLIC_YM_ID — без неё компонент
 * не рендерит ничего, поэтому в разработке счётчик молчит и статистику не
 * портит.
 *
 * Настройки выбраны под наши документы (политика, п. 10):
 *  - webvisor ВЫКЛЮЧЕН: запись сессии снимала бы то, что человек печатает в
 *    формах (названия товаров, преимущества), — это лишние данные и лишний
 *    риск по 152-ФЗ. Карта кликов остаётся;
 *  - fingerprint-технологии не используем (обещано в п. 10.2 политики);
 *  - ssr:true — сайт отдаётся с сервера, об этом Метрике надо сказать явно;
 *  - переходы между разделами студии считаются вручную (см. RouteTracker):
 *    в Next.js это client-side навигация без перезагрузки, сама Метрика её
 *    не увидит и все действия приписала бы одной странице входа.
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
          (window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=${YM_ID}", "ym");

          ym(${YM_ID}, "init", {
            ssr: true,
            clickmap: true,
            trackLinks: true,
            accurateTrackBounce: true,
            webvisor: false,
            referrer: document.referrer,
            url: location.href
          });
        `}
      </Script>
      <RouteTracker />
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
 * Переходы внутри студии — отдельные просмотры. Первый хит уже отправил init,
 * поэтому стартовый путь пропускаем.
 */
function RouteTracker() {
  const pathname = usePathname();
  const first = React.useRef(true);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ym = (window as unknown as { ym?: (...args: unknown[]) => void }).ym;
    try {
      ym?.(Number(YM_ID), "hit", window.location.href, { referer: document.referrer });
    } catch {
      // аналитика никогда не должна ломать навигацию
    }
  }, [pathname]);

  return null;
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
