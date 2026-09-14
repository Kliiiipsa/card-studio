import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { isSmtpConfigured } from "@/core/auth/mailer";
import {
  campaignAudience,
  renderLetter,
  sendCampaign,
  sendCampaignTest,
} from "@/core/marketing/campaign";

export const runtime = "nodejs";
// 14 писем × 1,5 с паузы + SMTP — с запасом; при росте базы слать пачками
export const maxDuration = 120;

const schema = z.object({
  campaign: z.enum(["second-card"]),
  mode: z.enum(["preview", "test", "send"]),
  /** тест: на какой адрес (по умолчанию — почта админа из сессии) */
  to: z.string().email().max(200).optional(),
});

/**
 * ADMIN: рассылка подписчикам.
 *  preview — кому уйдёт (по вариантам) и текст письма, ничего не шлёт;
 *  test    — оба варианта на почту админа, в журнал не пишет;
 *  send    — всем, кому ещё не уходило; каждый успех записывается.
 */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    const body = await parseBody(req, schema);

    if (body.mode === "preview") {
      const { recipients, alreadySent } = await campaignAudience(body.campaign);
      const sample = recipients[0] ?? {
        email: session.email,
        variant: "second" as const,
        gens: 1,
        balance: 8,
      };
      return ok({
        total: recipients.length,
        first: recipients.filter((r) => r.variant === "first").length,
        second: recipients.filter((r) => r.variant === "second").length,
        alreadySent,
        mailConfigured: isSmtpConfigured(),
        sample: renderLetter(body.campaign, sample).text,
      });
    }
    if (!isSmtpConfigured()) throw new AppError("Почта не настроена — письма не уйдут.", 503);
    if (body.mode === "test") {
      const to = (body.to ?? session.email).trim().toLowerCase();
      await sendCampaignTest(body.campaign, to);
      return ok({ testSentTo: to });
    }
    return ok(await sendCampaign(body.campaign));
  } catch (err) {
    return fail(err);
  }
}
