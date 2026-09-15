import type { Metadata } from "next";
import { LegalDocument, LEGAL_TITLES } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: `${LEGAL_TITLES.terms} — Kartogen`,
  alternates: { canonical: "https://kartogen.ru/terms" },
};

export default function TermsPage() {
  return <LegalDocument slug="terms" />;
}
