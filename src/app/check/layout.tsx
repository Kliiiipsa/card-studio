import type { Metadata } from "next";

/**
 * Пока страница скрытая (лид-магнит на одобрении) — noindex. После вывода на
 * главную: убрать robots и добавить description/canonical — страница может
 * ранжироваться по «проверка карточки wildberries бесплатно».
 */
export const metadata: Metadata = {
  title: "Бесплатная проверка карточки — Kartogen",
  robots: { index: false, follow: false },
};

export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
