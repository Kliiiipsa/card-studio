import { fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { paymentsOnDate } from "@/core/billing/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Выгрузка платежей (чеков) за конкретный МОСКОВСКИЙ день — CSV, который
 * Excel открывает таблицей. Разделитель «;» и UTF-8 BOM: русский Excel так
 * корректно раскладывает по столбцам и не ломает кириллицу.
 */
function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Сумма в рублях из комментария вида «ЮKassa: 500.00 ₽ (+35 бонус)…». */
function rublesFromComment(comment: string | null): string {
  const m = comment ? /(\d+(?:[.,]\d+)?)\s*₽/.exec(comment) : null;
  return m ? m[1].replace(".", ",") : "";
}

export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);

    const date = new URL(req.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError("Укажите дату в формате ГГГГ-ММ-ДД.");
    }

    const rows = await paymentsOnDate(date);
    const header = [
      "Дата и время (МСК)",
      "Email",
      "Сумма, ₽",
      "Начислено генов",
      "Идентификатор платежа",
      "Комментарий",
    ];
    const lines = [header.map(csvCell).join(";")];
    for (const t of rows) {
      const msk = new Date(t.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
      const paymentId = (t.reference ?? "").replace(/^yk-/, "");
      lines.push(
        [msk, t.email, rublesFromComment(t.comment), t.amount, paymentId, t.comment ?? ""]
          .map(csvCell)
          .join(";"),
      );
    }
    // строка итога
    const totalRub = rows.reduce((s, t) => {
      const r = rublesFromComment(t.comment).replace(",", ".");
      return s + (Number(r) || 0);
    }, 0);
    lines.push(["ИТОГО", "", String(totalRub).replace(".", ","), "", "", `платежей: ${rows.length}`].map(csvCell).join(";"));

    const csv = "﻿" + lines.join("\r\n"); // BOM → Excel корректно читает кириллицу
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kartogen-cheki-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
