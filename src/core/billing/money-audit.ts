import "server-only";
import {
  auditSnapshot,
  billingEnabled,
  markAuditAlerted,
  recordAuditFindings,
  type StoredAuditFinding,
} from "@/core/billing/billing";
import { listSucceededPayments, yookassaConfigured } from "@/core/billing/yookassa";
import { auditLedger } from "@/core/billing/audit-rules";
import { isHiddenAccount } from "@/core/auth/hidden-accounts";
import { notifyOwner } from "@/core/notify/owner";

/**
 * Сверка денег: журнал генов против самого себя и против ЮKassa.
 *
 * Зачем: 06.11.2026 повторная проверка старого платежа выдала клиенту бонус
 * второй раз, и узнали мы об этом случайно. Сверка раз в час сама находит
 * такие вещи — бонус к давнему платежу, оплату без зачисления, зачисление
 * без оплаты, баланс, не равный сумме журнала, — и пишет владельцу.
 *
 * Правила — в audit-rules.ts (чистая функция, покрыта автотестом, который
 * запускается перед каждой сборкой). Здесь только сбор данных и тревога.
 * Сверка ничего не меняет в деньгах: только читает и ведёт свой список
 * расхождений (billing_audit_findings).
 */

/** за сколько дней сверяем платежи ЮKassa с журналом */
const WINDOW_DAYS = 7;
/** запас при запросе платежей: платёж создан в одном дне, оплачен в другом */
const PAYMENTS_SLACK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type MoneyAuditResult = {
  checkedAt: string;
  /** false — ЮKassa не ответила, сверка платежей в этот раз пропущена */
  paymentsChecked: boolean;
  /** расхождения за окно: и новые, и уже принятые владельцем */
  findings: StoredAuditFinding[];
  /** из них ещё не принятые — по ним карточка красная */
  open: StoredAuditFinding[];
};

export async function runMoneyAudit(): Promise<MoneyAuditResult> {
  const nowMs = Date.now();
  const windowStartMs = nowMs - WINDOW_DAYS * DAY_MS;
  const snapshot = await auditSnapshot(new Date(windowStartMs).toISOString());

  let payments = null as Awaited<ReturnType<typeof listSucceededPayments>> | null;
  if (yookassaConfigured()) {
    try {
      payments = await listSucceededPayments(
        new Date(windowStartMs - PAYMENTS_SLACK_DAYS * DAY_MS).toISOString(),
      );
    } catch (e) {
      console.error("[money-audit] ЮKassa не ответила, сверка платежей пропущена:", e);
    }
  }

  const raw = auditLedger({
    nowMs,
    windowStartMs,
    recent: snapshot.recent,
    topupsByRef: snapshot.topupsByRef,
    balanceIssues: snapshot.balanceIssues,
    payments,
  })
    // тестовые и владельческие аккаунты: на них руками правят баланс и
    // гоняют демо-пополнения, тревога по ним — шум
    .filter((f) => !(f.email && isHiddenAccount(f.email)));

  const findings = await recordAuditFindings(raw);
  return {
    checkedAt: new Date(nowMs).toISOString(),
    paymentsChecked: payments !== null,
    findings,
    open: findings.filter((f) => !f.ackedAt),
  };
}

/**
 * Прогон с тревогой: по каждому новому расхождению владельцу уходит ОДНО
 * уведомление. Почта — с подробностями и адресом клиента; в Telegram только
 * обезличенные заголовки (канал трансграничный, см. notify/owner.ts).
 */
export async function runMoneyAuditAndAlert(): Promise<MoneyAuditResult> {
  const result = await runMoneyAudit();
  const fresh = result.open.filter((f) => !f.alertedAt);
  if (fresh.length > 0) {
    const subject =
      fresh.length === 1
        ? `Kartogen, сверка денег: ${fresh[0].title}`
        : `Kartogen, сверка денег: расхождений — ${fresh.length}`;
    const emailBody =
      fresh
        .map((f, i) => `${i + 1}. ${f.title}\n   ${f.email ?? "—"}\n   ${f.detail}`)
        .join("\n\n") +
      `\n\nПосмотреть и снять разобранное: админка → «Состояние» → «Сверка денег».`;
    const telegramBody =
      fresh.map((f, i) => `${i + 1}. ${f.title}`).join("\n") +
      `\n\nПодробности в письме и в админке, вкладка «Состояние».`;
    await notifyOwner(subject, emailBody, telegramBody);
    await markAuditAlerted(fresh.map((f) => f.key));
  }
  return result;
}

/* ------------------------------ фоновый цикл ------------------------------ */

type LoopState = { started: boolean; running: boolean };
const loop: LoopState = ((globalThis as Record<string, unknown>).__moneyAuditLoop ??= {
  started: false,
  running: false,
}) as LoopState;

/** первый прогон — не сразу после старта: даём серверу подняться после деплоя */
const FIRST_RUN_MS = 10 * 60 * 1000;
const EVERY_MS = 60 * 60 * 1000;

/**
 * Запустить ежечасную сверку. Вызывается один раз при старте сервера
 * (instrumentation.ts). Состояние на globalThis — переживает HMR в dev.
 * Локально без MONEY_AUDIT=1 не запускается: dev смотрит в ту же базу, что и
 * прод, и две сверки слали бы владельцу по два письма.
 */
export function startMoneyAuditLoop(): void {
  if (loop.started) return;
  if (!billingEnabled()) return;
  if (process.env.NODE_ENV !== "production" && process.env.MONEY_AUDIT !== "1") return;
  loop.started = true;
  const tick = async () => {
    if (loop.running) return;
    loop.running = true;
    try {
      await runMoneyAuditAndAlert();
    } catch (e) {
      console.error("[money-audit] прогон не удался:", e);
    } finally {
      loop.running = false;
    }
  };
  setTimeout(() => void tick(), FIRST_RUN_MS).unref?.();
  setInterval(() => void tick(), EVERY_MS).unref?.();
}
