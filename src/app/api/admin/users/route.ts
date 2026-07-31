import { ok, fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { sessionFromRequest } from "@/core/auth/session";
import { listUsers } from "@/core/auth/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await sessionFromRequest(req);
    if (session?.role !== "admin") throw new AppError("Только для администратора.", 403);
    const users = await listUsers();
    return ok({
      users: users.map((u) => ({
        email: u.email,
        role: u.role,
        verified: u.verified,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    return fail(err);
  }
}
