import { billingEnabled, applyTx } from "./billing";
import { WELCOME_SPARKS } from "./prices";
import { wasDeleted } from "@/core/auth/deletion";
import { canonicalEmail } from "@/core/auth/domains";

/**
 * Starter sparks, granted exactly once per email (deduplicated by reference).
 * Returns the new balance, or null when billing is disabled.
 *
 * Удалённый и заново созданный аккаунт бонус не получает: схема
 * «зарегистрировался → потратил бонус → удалился → зарегистрировался» не
 * должна давать бесплатные гены по кругу.
 */
export async function grantWelcomeBonus(email: string): Promise<number | null> {
  if (!billingEnabled()) return null;
  if (await wasDeleted(email)) return 0;
  // reference по КАНОНИЧЕСКОМУ адресу: все plus-варианты одного ящика делят
  // один бонус (второй получит конфликт reference и 0 генов).
  const { balance } = await applyTx({
    email,
    amount: WELCOME_SPARKS,
    type: "welcome",
    reference: `welcome:${canonicalEmail(email)}`,
    comment: "Стартовый бонус за регистрацию",
  });
  return balance;
}
