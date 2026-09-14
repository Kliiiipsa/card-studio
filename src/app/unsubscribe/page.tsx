import Link from "next/link";
import { verifyUnsubscribe } from "@/core/marketing/unsubscribe";
import { recordMarketingConsent } from "@/core/auth/marketing-consent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Отписка от рассылки — Kartogen", robots: { index: false } };

/**
 * Отписка от рекламной рассылки по подписанной ссылке из письма. Без входа:
 * человек кликает и сразу отписан, запись «revoked» уходит в тот же журнал
 * согласий, что и галочка при регистрации.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { e?: string; t?: string };
}) {
  const email = verifyUnsubscribe(searchParams.e, searchParams.t);
  if (email) {
    await recordMarketingConsent({ email, granted: false, userAgent: "unsubscribe-link" });
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-16 text-center">
      {email ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Вы отписаны</h1>
          <p className="text-muted-foreground">
            Советы и новости Kartogen на <b>{email}</b> больше не придут. Письма с кодами входа и
            чеки об оплате это не затрагивает.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Ссылка не подошла</h1>
          <p className="text-muted-foreground">
            Похоже, ссылка повреждена. Напишите на{" "}
            <a href="mailto:admin@kartogen.ru" className="underline">
              admin@kartogen.ru
            </a>
            , отпишем вручную.
          </p>
        </>
      )}
      <p className="text-sm">
        <Link href="/" className="text-primary underline underline-offset-4">
          На главную
        </Link>
      </p>
    </main>
  );
}
