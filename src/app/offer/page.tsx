import type { Metadata } from "next";
import { LegalDocument, LEGAL_TITLES } from "@/components/legal/legal-document";

export const metadata: Metadata = { title: `${LEGAL_TITLES.offer} — Kartogen` };

export default function OfferPage() {
  return <LegalDocument slug="offer" />;
}
