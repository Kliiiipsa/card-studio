import type { Metadata } from "next";
import { LegalDocument, LEGAL_TITLES } from "@/components/legal/legal-document";

export const metadata: Metadata = { title: `${LEGAL_TITLES.privacy} — Kartogen` };

export default function PrivacyPage() {
  return <LegalDocument slug="privacy" />;
}
