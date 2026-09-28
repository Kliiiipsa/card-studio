"use client";
import * as React from "react";
import Link from "next/link";
import { Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfileStore } from "@/store/profile-store";
import { REFERRAL } from "@/core/billing/prices";

/**
 * Подсказка «позовите коллегу» после удачной генерации (решение владельца
 * 28.09.2026). Человек только что получил результат и доволен — это второй
 * уместный момент для приглашения после оплаты.
 *
 * Не чаще раза в неделю на браузер: подсказка после каждой карточки
 * раздражала бы и обесценила бы саму себя. Срок храним в localStorage — это
 * удобство одного зрителя, а не учёт; если хранилище недоступно, подсказку
 * просто не показываем, чтобы не всплывать на каждой генерации.
 *
 * Под тем же гейтом, что и раздел: закрытым пользователям показали бы кнопку
 * на страницу, куда их не пустят.
 */

const EVENT = "kartogen:generated";
const KEY = "kartogen_invite_nudge_at";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** ждём, пока уйдёт тост «Готово»: два окна в одном углу сразу — шум */
const SHOW_DELAY_MS = 6000;
const HIDE_AFTER_MS = 30_000;

/** Позвать из места, где генерация успешно завершилась. */
export function nudgeAfterGeneration(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

function dueNow(): boolean {
  try {
    const last = Number(localStorage.getItem(KEY) ?? 0);
    return !last || Date.now() - last >= WEEK_MS;
  } catch {
    return false;
  }
}

function markShown(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // без хранилища dueNow и так вернёт false
  }
}

export function InviteNudge() {
  const allowed = useProfileStore((s) => s.referrals);
  const role = useProfileStore((s) => s.role);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!allowed) return;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onGenerated = () => {
      // админ видит подсказку после каждой генерации — иначе текст не проверить
      if (role !== "admin" && !dueNow()) return;
      markShown();
      showTimer = setTimeout(() => {
        setOpen(true);
        hideTimer = setTimeout(() => setOpen(false), HIDE_AFTER_MS);
      }, SHOW_DELAY_MS);
    };
    window.addEventListener(EVENT, onGenerated);
    return () => {
      window.removeEventListener(EVENT, onGenerated);
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [allowed, role]);

  if (!allowed || !open) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[90] w-[calc(100vw-2rem)] max-w-sm rounded-xl border bg-card p-4 shadow-lg animate-in slide-in-from-right-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Gift className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Понравился результат?</p>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Позовите коллегу: с каждого его пополнения вам придёт {REFERRAL.referrerPercent}%
            генами, а ему — плюс {REFERRAL.refereeFirstTopupPercent}% к первому.
          </p>
          {role === "admin" && (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Вы видите подсказку после каждой генерации, клиенты — раз в неделю.
            </p>
          )}
          <Link href="/invite" onClick={() => setOpen(false)} className="mt-2.5 inline-block">
            <Button variant="outline" size="sm">
              Взять ссылку
            </Button>
          </Link>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Закрыть"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
