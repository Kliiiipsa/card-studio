/**
 * Аккаунты владельца и тестовые — их прячем из админского списка
 * пользователей по умолчанию, чтобы статистика и воронка не засорялись.
 * Не удаляем и не блокируем: это просто «скрыть из вида». В админке есть
 * переключатель «показать тестовые» (?all=1), так что список восстановим
 * без правок кода — чтобы добавить/убрать почту, правьте этот массив.
 */
const HIDDEN = [
  "pgtest@yandex.ru",
  "sparks-test@yandex.ru",
  "prod-sparks@yandex.ru",
  "leks.mimi@mail.ru",
  "jiwef@mail.ru",
  "tumohuk2004@yandex.ru",
  "pay-test@kartogen.ru",
  "kliiiipsa@yandex.ru",
];

const HIDDEN_SET = new Set(HIDDEN.map((e) => e.trim().toLowerCase()));

export function isHiddenAccount(email: string): boolean {
  return HIDDEN_SET.has(email.trim().toLowerCase());
}
