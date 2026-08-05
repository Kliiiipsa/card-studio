"use client";
import * as React from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Gem, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./sidebar";

/** Burger + slide-in navigation panel for < md, mirrors the desktop sidebar. */
export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Открыть меню">
          <Menu className="h-5 w-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-background shadow-xl duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Навигация</Dialog.Title>
          <div className="flex items-center justify-between border-b px-4 py-4">
            <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-500 text-white shadow-md">
                <Gem className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold whitespace-nowrap">Nevario</span>
            </Link>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Закрыть меню">
                <X className="h-5 w-5" />
              </Button>
            </Dialog.Close>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            <NavLinks onNavigate={() => setOpen(false)} />
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
