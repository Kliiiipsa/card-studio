import type { Metadata } from "next";

/**
 * Публичный лид-магнит (одобрен 2026-09-01, выведен на главную): индексируем —
 * страница может ранжироваться по «проверка/анализ карточки wildberries бесплатно».
 */
export const metadata: Metadata = {
  title: "Бесплатный анализ карточки товара — Kartogen",
  description:
    "Загрузите фото карточки или товара — ИИ оценит её как покупатель на Wildberries, поставит балл и подскажет, что мешает продажам. Бесплатно, без регистрации.",
  alternates: { canonical: "https://kartogen.ru/check" },
};

export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
