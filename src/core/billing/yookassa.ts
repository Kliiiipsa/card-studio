import { randomUUID } from "node:crypto";

/**
 * ЮKassa (YooMoney for business) HTTP API v3 — минимальный клиент.
 * Магазин самозанятого: чеки формирует «Мой налог» (54-ФЗ на НПД не
 * распространяется), поэтому объект receipt в запросах не нужен.
 *
 * Схема оплаты (одностадийная, capture: true):
 *  1. POST /v3/payments → { id, confirmation.confirmation_url } — редиректим
 *     пользователя на страницу оплаты ЮKassa.
 *  2. Зачисление искр — в двух местах, оба идемпотентны через
 *     applyTx(reference = "yk-<paymentId>"):
 *       а) вебхук payment.succeeded (/api/billing/yookassa/webhook);
 *       б) проверка при возврате пользователя на /billing (status endpoint).
 *     Вебхук ничему из своего тела не верит — только повторному GET платежа
 *     нашими ключами (у уведомлений ЮKassa нет подписи).
 */

const API = "https://api.yookassa.ru/v3";

export type YooPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
  description?: string;
};

export function yookassaConfigured(): boolean {
  return Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
}

function authHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID ?? "";
  const secret = process.env.YOOKASSA_SECRET_KEY ?? "";
  return "Basic " + Buffer.from(`${shopId}:${secret}`).toString("base64");
}

async function yooFetch(path: string, init?: RequestInit & { idempotenceKey?: string }): Promise<YooPayment> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init?.idempotenceKey ? { "Idempotence-Key": init.idempotenceKey } : {}),
    },
    // платёжные запросы не кэшировать ни при каких обстоятельствах
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as YooPayment & {
    type?: string;
    description?: string;
    code?: string;
  };
  if (!res.ok) {
    // тело ошибки ЮKassa: { type: "error", code, description }
    throw new Error(`ЮKassa ${res.status}: ${body.description ?? body.code ?? "неизвестная ошибка"}`);
  }
  return body;
}

/** Создать платёж; вернуть id и URL страницы оплаты. */
export async function createPayment(args: {
  amountRub: number;
  description: string;
  returnUrl: string;
  /** попадает в metadata и возвращается в вебхуке — email, sparks, bonus */
  metadata: Record<string, string>;
}): Promise<{ id: string; confirmationUrl: string }> {
  const payment = await yooFetch("/payments", {
    method: "POST",
    idempotenceKey: randomUUID(),
    body: JSON.stringify({
      amount: { value: args.amountRub.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: args.returnUrl },
      description: args.description.slice(0, 128),
      metadata: args.metadata,
    }),
  });
  const url = payment.confirmation?.confirmation_url;
  if (!url) throw new Error("ЮKassa не вернула ссылку на оплату.");
  return { id: payment.id, confirmationUrl: url };
}

/** Запросить платёж по id — единственный доверенный источник статуса. */
export function getPayment(id: string): Promise<YooPayment> {
  return yooFetch(`/payments/${encodeURIComponent(id)}`);
}
