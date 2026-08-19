import { NextResponse } from "next/server";
import { yookassaConfigured } from "@/core/billing/yookassa";
import { verifyAndCredit } from "@/core/billing/yookassa-credit";

export const runtime = "nodejs";

/**
 * HTTP-уведомления ЮKassa (настраиваются в ЛК: Интеграции → HTTP-уведомления,
 * событие payment.succeeded → https://kartogen.ru/api/billing/yookassa/webhook).
 *
 * У уведомлений нет подписи, поэтому телу мы НЕ верим: берём только object.id
 * и перепроверяем платёж прямым GET к ЮKassa нашими ключами. Зачисление
 * идемпотентно (reference yk-<id>), продублировать искры повторной доставкой
 * или подделкой запроса нельзя.
 *
 * Ответ не-200 заставит ЮKassa повторять доставку (до 24 часов) — поэтому
 * 500 возвращаем только когда зачисление реально не удалось и повтор нужен.
 */
export async function POST(req: Request) {
  if (!yookassaConfigured()) return NextResponse.json({ ok: false }, { status: 503 });

  let event = "";
  let paymentId = "";
  try {
    const body = (await req.json()) as { event?: string; object?: { id?: string } };
    event = body.event ?? "";
    paymentId = body.object?.id ?? "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!paymentId) return NextResponse.json({ ok: false }, { status: 400 });

  // интересует только успешная оплата; отмены и прочее подтверждаем молча
  if (event !== "payment.succeeded") return NextResponse.json({ ok: true });

  try {
    const { credited, sparksTotal } = await verifyAndCredit(paymentId);
    if (credited) {
      console.log(`[yookassa] payment ${paymentId}: credited ${sparksTotal} sparks`);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[yookassa] webhook ${paymentId} failed:`, err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
