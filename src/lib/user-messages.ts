/**
 * Единые тексты ошибок для клиента. Правило: человек должен понять
 *  (1) что произошло, (2) что деньги целы, (3) НУЖНО ли повторять.
 * Технические подробности («fal-video status ERROR…») остаются в логах и в
 * админском журнале генераций — клиенту их показывать нельзя: они пугают и
 * провоцируют повторные попытки там, где повтор бесполезен.
 */
export const SUPPORT_EMAIL = "admin@kartogen.ru";

const NOT_CHARGED = "Гены за неудачную попытку не списаны.";

export const USER_ERRORS = {
  /** провайдер лежит / кончился баланс / отвечает 5xx — повторять бесполезно */
  providerDown:
    `На стороне сервиса генерации сейчас неполадки — мы уже знаем и занимаемся этим. ` +
    `${NOT_CHARGED} Повторять прямо сейчас не нужно: попробуйте через 20–30 минут. ` +
    `Если вопрос срочный — напишите нам на ${SUPPORT_EMAIL}, поможем.`,

  /** временный сетевой сбой — повтор уместен */
  transient:
    `Не удалось связаться с сервисом генерации — похоже, короткий сбой связи. ` +
    `${NOT_CHARGED} Попробуйте ещё раз через минуту.`,

  /** очередь провайдера перегружена */
  busy:
    `Сервис генерации сейчас перегружен запросами. ${NOT_CHARGED} ` +
    `Попробуйте через несколько минут — обычно это быстро проходит.`,

  /** автоматическая проверка контента отклонила изображение */
  moderation:
    `Изображение не прошло автоматическую проверку сервиса генерации. ${NOT_CHARGED} ` +
    `Попробуйте другое фото товара — чаще всего помогает более нейтральный кадр. ` +
    `Если считаете, что это ошибка, напишите нам на ${SUPPORT_EMAIL}.`,

  /** превышено время ожидания */
  timeout:
    `Генерация заняла дольше обычного, и мы её остановили. ${NOT_CHARGED} ` +
    `Попробуйте ещё раз через несколько минут.`,

  /** генерация не настроена (нет ключа) — это наша проблема, не клиента */
  notConfigured:
    `Эта функция временно недоступна: идут технические работы. ${NOT_CHARGED} ` +
    `Напишите нам на ${SUPPORT_EMAIL}, если нужно срочно.`,

  /** непредвиденная ошибка на нашей стороне */
  unexpected:
    `На сайте идут внеплановые технические работы — приносим извинения. ` +
    `${NOT_CHARGED} Попробуйте позже или напишите нам на ${SUPPORT_EMAIL}.`,
} as const;

/**
 * HTTP-код от провайдера → понятный текст для клиента.
 * 401/402/403 — кончился баланс или ключ, 422 — модерация, 429 — перегрузка.
 */
export function providerHttpMessage(status: number): string {
  if (status === 401 || status === 402 || status === 403) return USER_ERRORS.providerDown;
  if (status === 422 || status === 400) return USER_ERRORS.moderation;
  if (status === 429) return USER_ERRORS.busy;
  if (status >= 500) return USER_ERRORS.providerDown;
  return USER_ERRORS.transient;
}

/**
 * Техническая причина неудачной задачи (её пишет watcher в базу) → текст для
 * клиента. Админский журнал по-прежнему показывает оригинал.
 */
export function friendlyJobError(technical: string | null | undefined): string {
  const t = (technical ?? "").toLowerCase();
  if (!t) return USER_ERRORS.unexpected;
  if (t.includes("timeout") || t.includes("не завершилась")) return USER_ERRORS.timeout;
  if (t.includes("422") || t.includes("moderation") || t.includes("safety") || t.includes("nsfw")) {
    return USER_ERRORS.moderation;
  }
  if (t.includes("429")) return USER_ERRORS.busy;
  if (t.includes("401") || t.includes("402") || t.includes("403") || t.includes("balance")) {
    return USER_ERRORS.providerDown;
  }
  if (t.includes("fetch failed") || t.includes("network") || t.includes("econn")) {
    return USER_ERRORS.transient;
  }
  return USER_ERRORS.providerDown;
}
