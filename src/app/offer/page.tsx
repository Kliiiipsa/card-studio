import type { Metadata } from "next";
import { LegalDocument, LEGAL_TITLES } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: `${LEGAL_TITLES.offer} — Kartogen`,
  alternates: { canonical: "https://kartogen.ru/offer" },
};

export default function OfferPage() {
  return <LegalDocument slug="offer" />;
}
