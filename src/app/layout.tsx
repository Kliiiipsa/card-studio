import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { YandexMetrica } from "@/components/analytics/yandex-metrica";
import { AttributionCapture } from "@/components/analytics/attribution-capture";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

const SITE_URL = process.env.SITE_URL || "https://kliiiipsa-card-studio-30da.twc1.net";
// В title намеренно оставлены названия площадок: это поисковые запросы, по
// которым нас ищут селлеры. В интерфейсе везде — нейтральное «маркетплейсы».
const TITLE = "Kartogen — AI-карточки и инфографика для маркетплейсов (Wildberries, Ozon)";
const DESCRIPTION =
  "Фото товара, готовая инфографика с русским текстом, видео и анализ карточек — за минуты. 20 генов в подарок при регистрации.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  // подтверждение прав в Google Search Console (не удалять — иначе слетит)
  verification: { google: "-R-CzL1J1dyVwZA1o4s0A0tiJx0Hiv2rJOh3J2NTDwU" },
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
        <YandexMetrica />
      </body>
    </html>
  );
}
