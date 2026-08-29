"use client";
import * as React from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

/**
 * Пиксель VK Рекламы (счётчик Top.Mail.Ru). Нужен, чтобы VK Ads видел визиты и
 * конверсии из рекламы — без него кампания показывает CR=0 (мы это и наблюдали).
 * Грузится только в проде, чтобы не пачкать статистику из разработки.
 *
 * По ПД: данные уходят в Mail.ru (РФ-компания) — трансграничной передачи нет,
 * позиция «вариант Г» не нарушается. В Политике стоит упомянуть Top.Mail.Ru
 * рядом с Яндекс.Метрикой (правка текста политики — отдельно).
 */
const VK_PIXEL_ID = process.env.NEXT_PUBLIC_VK_PIXEL_ID || "3790476";
const ENABLED = process.env.NODE_ENV === "production";

export function VkPixel() {
  if (!ENABLED) return null;
  return (
    <>
      <Script id="vk-top-mailru" strategy="afterInteractive">
        {`
          var _tmr = window._tmr || (window._tmr = []);
          _tmr.push({id: "${VK_PIXEL_ID}", type: "pageView", start: (new Date()).getTime()});
          (function (d, w, id) {
            if (d.getElementById(id)) return;
            var ts = d.createElement("script"); ts.type = "text/javascript"; ts.async = true; ts.id = id;
            ts.src = "https://top-fwz1.mail.ru/js/code.js";
            var f = function () {var s = d.getElementsByTagName("script")[0]; s.parentNode.insertBefore(ts, s);};
            if (w.opera == "[object Opera]") { d.addEventListener("DOMContentLoaded", f, false); } else { f(); }
          })(document, window, "tmr-code");
        `}
      </Script>
      <VkRouteTracker />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://top-fwz1.mail.ru/counter?id=${VK_PIXEL_ID};js=na`}
          style={{ position: "absolute", left: "-9999px" }}
          alt=""
        />
      </noscript>
    </>
  );
}

/**
 * Переходы внутри студии — client-side навигация Next.js без перезагрузки.
 * Top.Mail.Ru сам их не видит, поэтому досылаем pageView вручную (первый хит
 * уже отправлен инициализацией).
 */
function VkRouteTracker() {
  const pathname = usePathname();
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      const w = window as unknown as { _tmr?: Array<Record<string, unknown>> };
      (w._tmr = w._tmr || []).push({ id: VK_PIXEL_ID, type: "pageView", start: Date.now() });
    } catch {
      // аналитика никогда не должна ломать навигацию
    }
  }, [pathname]);
  return null;
}
