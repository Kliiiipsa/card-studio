import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import {
  listAll,
  createNotice,
  setActive,
  deleteNotice,
  readCounts,
  noticesEnabled,
} from "@/core/notices/notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(req: Request) {
  const session = await sessionFromRequest(req);
  if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
  if (!noticesEnabled()) throw new AppError("Уведомления недоступны: нет базы данных.", 503);
  return session;
}

/** Все уведомления + сколько человек каждое открыло. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const notices = await listAll();
    const reads = await readCounts(notices.map((n) => n.id));
    return ok({ notices: notices.map((n) => ({ ...n, reads: reads[n.id] ?? 0 })) });
  } catch (err) {
    return fail(err);
  }
}

const createSchema = z.object({
  kind: z.enum(["info", "promo", "maintenance"]).default("info"),
  title: z.string().min(3).max(120),
  body: z.string().max(2000).default(""),
  // только внутренний путь: внешние ссылки из уведомления — вектор для фишинга,
  // если админский доступ когда-нибудь утечёт
  url: z
    .string()
    .max(300)
    .regex(/^\/[A-Za-z0-9/_\-?=&.]*$/, "Ссылка — внутренний путь, например /billing")
    .nullable()
    .optional(),
  expiresAt: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await parseBody(req, createSchema);
    const notice = await createNotice({
      ...body,
      kind: body.kind ?? "info",
      body: body.body ?? "",
    });
    return ok({ notice });
  } catch (err) {
    return fail(err);
  }
}

const patchSchema = z.object({ id: z.number().int().positive(), active: z.boolean() });

export async function PATCH(req: Request) {
  try {
    await requireAdmin(req);
    const body = await parseBody(req, patchSchema);
    await setActive(body.id, body.active);
    return ok({ id: body.id, active: body.active });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin(req);
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) throw new AppError("Не указано уведомление.", 400);
    await deleteNotice(id);
    return ok({ id });
  } catch (err) {
    return fail(err);
  }
}
