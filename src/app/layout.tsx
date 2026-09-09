import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { YandexMetrica } from "@/components/analytics/yandex-metrica";
import { VkPixel } from "@/components/analytics/vk-pixel";
import { AttributionCapture } from "@/components/analytics/attribution-capture";
import { OAuthRegisterPing } from "@/components/analytics/oauth-register-ping";
import { WELCOME_SPARKS } from "@/core/billing/prices";

// Шрифт лежит в репозитории (Inter 4.1 variable, latin+cyrillic), а не тянется с
// Google при сборке: 2026-09-07 сборка на Timeweb трижды упала на
// fonts.gstatic.com («request failed»), и деплой встал. Локальный файл —
// ноль внешних зависимостей у билда.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
});

const SITE_URL = process.env.SITE_URL || "https://kliiiipsa-card-studio-30da.twc1.net";
// В title намеренно оставлены названия площадок: это поисковые запросы, по
// которым нас ищут селлеры. В интерфейсе везде — нейтральное «маркетплейсы».
const TITLE = "Kartogen — AI-карточки и инфографика для маркетплейсов (Wildberries, Ozon)";
const DESCRIPTION =
  `Фото товара, готовая инфографика с русским текстом, видео и анализ карточек — за минуты. ${WELCOME_SPARKS} генов в подарок при регистрации.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  // подтверждение прав в Google Search Console (не удалять — иначе слетит)
  verification: {
    google: "-R-CzL1J1dyVwZA1o4s0A0tiJx0Hiv2rJOh3J2NTDwU",
    // Pinterest: подтверждение домена (НЕ УДАЛЯТЬ — слетит верификация)
    other: { "p:domain_verify": "22a3ca9d9dfb81ac84366a09449011d6" },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Kartogen",
    locale: "ru_RU",
    type: "website",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Kartogen" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster />
        <AttributionCapture />
        <OAuthRegisterPing />
        <YandexMetrica />
        <VkPixel />
      </body>
    </html>
  );
}
