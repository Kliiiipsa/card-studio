import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { listSectionFlags, setSectionDisabled, SWITCHABLE_SECTIONS } from "@/core/ops/section-flags";

export const runtime = "nodejs";

/**
 * Роль проверяем в самом хендлере, а не только в middleware: единственный слой
 * авторизации — плохая идея (аудит безопасности 2026-08-26), тем более рубильник
 * может выключить платные разделы всем пользователям.
 */
async function requireAdmin(req: Request): Promise<void> {
  const session = await sessionFromRequest(req);
  if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return ok({ flags: await listSectionFlags() });
  } catch (err) {
    return fail(err);
  }
}

const schema = z.object({
  action: z.enum(
    SWITCHABLE_SECTIONS.map((s) => s.action) as [string, ...string[]],
  ),
  disabled: z.boolean(),
});

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await parseBody(req, schema);
    await setSectionDisabled(body.action, body.disabled);
    return ok({ flags: await listSectionFlags() });
  } catch (err) {
    return fail(err);
  }
}
