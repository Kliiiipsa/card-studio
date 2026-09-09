import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { listForUser, markRead, noticeBellEnabled, noticesEnabled } from "@/core/notices/notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Уведомления сервиса для текущего аккаунта + счётчик непрочитанных. */
export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    // гейт: пока колокольчик только у админа (env NOTICES=all — всем)
    if (!noticeBellEnabled(session.role) || !noticesEnabled()) return ok({ notices: [], unread: 0 });
    const notices = await listForUser(session.email);
    return ok({ notices, unread: notices.filter((n) => !n.read).length });
  } catch (err) {
    return fail(err);
  }
}

const readSchema = z.object({ ids: z.array(z.number().int().positive()).max(100) });

/** Отметить прочитанными — вызывается при открытии панели. */
export async function POST(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (!session) throw new AppError("Требуется вход.", 401);
    const body = await parseBody(req, readSchema);
    await markRead(session.email, body.ids);
    return ok({ read: body.ids.length });
  } catch (err) {
    return fail(err);
  }
}
