import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/core/auth/session";
import { referralsVisible } from "@/core/referrals/referrals";

/**
 * Серверный гейт раздела «Пригласить друга». Закрыт 24.09.2026 сразу после
 * выкладки по требованию владельца: раздел раздаёт гены, и открывать его
 * всем можно только после ручной проверки цепочки начислений на живом
 * аккаунте. Раскатка — переменная REFERRALS=all на проде, без выкладки кода.
 *
 * Пункт меню прячется отдельно (sidebar), но настоящая защита здесь: адрес
 * страницы можно просто угадать.
 */
export default async function InviteLayout({ children }: { children: React.ReactNode }) {
  const secret = process.env.AUTH_SECRET;
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = secret ? await verifySessionToken(secret, token) : null;
  if (!session) redirect("/login?from=%2Finvite");
  if (!referralsVisible(session.role)) redirect("/dashboard");
  return <>{children}</>;
}
