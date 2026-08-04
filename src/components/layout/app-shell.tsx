import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen surface-gradient">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
