import { recordClick } from "@/core/referrals/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Короткая реферальная ссылка kartogen.ru/r/CODE. Считаем переход (только
 * число, без персональных данных) и отправляем на главную с ?ref=CODE — там
 * клиент запомнит код (см. lib/referral.ts) и отдаст его при регистрации.
 *
 * UTM добавляем, чтобы такие регистрации были видны в «Источниках» админки
 * отдельным каналом, а не как прямой заход.
 * Хост — константа: за прокси Timeweb req.url приходит как localhost:3000.
 */
const SITE = process.env.SITE_URL || "https://kartogen.ru";

export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const code = (ctx.params.code ?? "").trim().toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return Response.redirect(SITE, 302);
  void recordClick(code);
  return Response.redirect(
    `${SITE}/?ref=${code}&utm_source=referral&utm_medium=invite&utm_campaign=friend`,
    302,
  );
}
