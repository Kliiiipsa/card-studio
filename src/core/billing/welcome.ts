import { billingEnabled, applyTx } from "./billing";
import { WELCOME_SPARKS } from "./prices";

/**
 * Starter sparks, granted exactly once per email (deduplicated by reference).
 * Returns the new balance, or null when billing is disabled.
 */
export async function grantWelcomeBonus(email: string): Promise<number | null> {
  if (!billingEnabled()) return null;
  const { balance } = await applyTx({
    email,
    amount: WELCOME_SPARKS,
    type: "welcome",
    reference: `welcome:${email}`,
    comment: "Стартовый бонус за регистрацию",
  });
  return balance;
}
