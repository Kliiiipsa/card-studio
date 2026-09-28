/**
 * Правила ручного ввода кода приглашения — чистые функции без базы и сети,
 * чтобы их можно было проверить скриптом на всех граничных случаях.
 *
 * Зачем код вообще (решение владельца 28.09.2026): ссылка запоминается в
 * браузере и теряется — друг открыл её в телефоне, а зарегистрировался с
 * компьютера; открыл внутри мессенджера, а потом зашёл обычным браузером. Оба
 * остаются без бонуса и считают, что программа не работает.
 */

/** сколько дней после регистрации можно ввести код */
export const INVITE_CODE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * День открытия программы всем. Задаётся переменной REFERRALS_OPENED_AT вместе
 * с REFERRALS=all. Пока программа закрыта, даты нет — и отсчёт окна для
 * аккаунтов, созданных до запуска, ещё не начался.
 */
export function parseOpenedAt(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * До какого момента аккаунт может ввести код приглашения.
 *
 *  - зарегистрирован после открытия программы — 14 дней от регистрации;
 *  - зарегистрирован до открытия — 14 дней от дня открытия (решение владельца:
 *    неплатившие старые аккаунты тоже могут, «всё равно нам прибыль»);
 *  - программа ещё не открыта — срок не идёт, возвращаем null.
 */
export function inviteDeadline(registeredAt: Date, openedAt: Date | null): Date | null {
  if (!openedAt) return null;
  const start = registeredAt.getTime() < openedAt.getTime() ? openedAt : registeredAt;
  return new Date(start.getTime() + INVITE_CODE_DAYS * DAY_MS);
}

export function inviteWindowOpen(
  registeredAt: Date,
  openedAt: Date | null,
  now: Date = new Date(),
): boolean {
  const deadline = inviteDeadline(registeredAt, openedAt);
  return deadline === null || now.getTime() <= deadline.getTime();
}

/**
 * Замкнёт ли новая связь «referee ← referrer» круг приглашений.
 *
 * Со ссылками круг невозможен: приглашённый всегда новый аккаунт. С кодом двое
 * знакомых ввели бы коды друг друга и получили вечные 10 % с пополнений друг
 * друга — то есть скидку, а не привлечение. То же через третьего: А ← Б ← В ← А.
 *
 * `referrerOf` — кто пригласил данный аккаунт (null, если никто). Идём вверх от
 * будущего пригласившего; встретили самого приглашаемого — круг. Возвращаем
 * глубину, на которой он нашёлся (1 — прямой обмен кодами), либо 0.
 */
export async function inviteCycleDepth(
  referee: string,
  referrer: string,
  referrerOf: (email: string) => Promise<string | null>,
  maxDepth = 12,
): Promise<number> {
  let current: string | null = referrer;
  const seen = new Set<string>();
  for (let depth = 1; depth <= maxDepth && current; depth++) {
    if (seen.has(current)) return 0; // старый круг в данных, к нашей паре не относится
    seen.add(current);
    const up: string | null = await referrerOf(current);
    if (up === referee) return depth;
    current = up;
  }
  return 0;
}

/**
 * Признаки возможной накрутки и что с ними делать.
 *
 * Оферта п. 6.15: признаки «учитываются в совокупности и сами по себе не
 * являются достаточным основанием для отказа». До 28.09.2026 код расходился с
 * офертой: один совпавший IP уже отменял начисления. У мобильных операторов и
 * в офисах один адрес на сотни людей, поэтому решение владельца — начислять,
 * но помечать в админке. Блокируем только когда признаков два и больше.
 */
export type InviteSign = "ip" | "deleted";

export function assessSigns(signs: InviteSign[]): {
  suspicious: boolean;
  blocked: boolean;
  reason: string | null;
} {
  const uniq = Array.from(new Set(signs));
  return {
    suspicious: uniq.length > 0,
    blocked: uniq.length >= 2,
    reason: uniq.length ? uniq.join(",") : null,
  };
}

/** подпись признака для админки */
export const SIGN_LABEL: Record<string, string> = {
  ip: "тот же сетевой адрес",
  deleted: "аккаунт уже удалялся",
};
