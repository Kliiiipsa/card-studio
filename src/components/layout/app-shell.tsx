import Link from "next/link";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const LEGAL_LINKS = [
  { href: "/pricing", label: "Тарифы" },
  { href: "/offer", label: "Оферта" },
  { href: "/terms", label: "Соглашение" },
  { href: "/privacy", label: "Персональные данные" },
];

export function AppShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen surface-gradient">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
        {/* Legal links reachable from every studio page — not just the landing.
            Payment providers and users expect the offer one click away from checkout. */}
        <footer className="border-t px-4 py-3 text-xs text-muted-foreground sm:px-6">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-foreground">
                {l.label}
              </Link>
            ))}
            <a href="mailto:admin@kartogen.ru" className="hover:text-foreground">
              admin@kartogen.ru
            </a>
            <span className="ml-auto">Самозанятый Плотников А. И., ИНН 220452891248</span>
          </nav>
        </footer>
      </div>
    </div>
  );
}
