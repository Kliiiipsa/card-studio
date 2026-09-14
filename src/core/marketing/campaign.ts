import { getPool } from "@/core/auth/store-pg";
import { marketingSubscribers } from "@/core/auth/marketing-consent";
import { isHiddenAccount } from "@/core/auth/hidden-accounts";
import { sendMail, type MailContent } from "@/core/auth/mailer";
import { unsubscribeLink } from "./unsubscribe";

/**
 * Рассылки подписчикам (галочка «Получать советы по карточкам и новости
 * сервиса»). Правила, которые здесь зашиты и которые нельзя обходить:
 *  - получатели = ТОЛЬКО живые аккаунты с действующим согласием
 *    (marketingSubscribers), минус тестовые, минус те, кому эта кампания уже
 *    ушла (таблица marketing_sends — второй раз одно письмо не уходит);
 *  - в каждом письме ссылка «отписаться» и заголовок List-Unsubscribe;
 *  - письмо содержит совет/новость, а не только промокод — иначе оно не
 *    соответствует тексту согласия;
 *  - пауза между письмами, чтобы почтовики не приняли пачку за спам.
 *
 * Текст письма — plain text: SMTP-транспорт шлёт только text/plain, и для
 * доставляемости первой рассылки это плюс, а не минус.
 */

const SITE = process.env.SITE_URL || "https://kartogen.ru";
const PAUSE_MS = 1500;

export type CampaignId = "second-card";
export type Variant = "first" | "second";

export type Recipient = { email: string; variant: Variant; gens: number; balance: number };

const utm = (path: string, campaign: CampaignId) =>
  `${SITE}${path}?utm_source=email&utm_medium=letter&utm_campaign=${campaign}`;

/* ------------------------------ письмо ------------------------------ */

const PROMO_CODE = "PLUS12";
const PROMO_UNTIL = "18 сентября";

function footer(email: string): string {
  return (
    `\r\n—\r\n` +
    `Вы получили это письмо, потому что при регистрации на kartogen.ru поставили галочку ` +
    `«Получать советы по карточкам и новости сервиса».\r\n` +
    `Отписаться: ${unsubscribeLink(email)}\r\n` +
    `Kartogen — AI-студия карточек для маркетплейсов · admin@kartogen.ru\r\n`
  );
}

function secondCardLetter(r: Recipient): MailContent {
  const c: CampaignId = "second-card";
  const subject =
    r.variant === "second"
      ? "Вторая карточка обычно лучше первой. И 12 генов на неё"
      : "Первая карточка за две минуты. И 12 генов сверху";

  const intro =
    r.variant === "second"
      ? `Вы уже собрали в Kartogen первую карточку. Вторая почти всегда получается сильнее: ` +
        `уже понятно, как студия читает фото и что стоит вынести в плашки. ` +
        `Три вещи, которые чаще всего решают:`
      : `Вы зарегистрировались в Kartogen, но карточку пока не собирали. Это две минуты: ` +
        `загрузите фото товара, нажмите «Заполнить по фото», выберите стиль и «Собрать инфографику». ` +
        `Подарочные гены на балансе целы. Три вещи, которые сразу делают карточку сильнее:`;

  const tips =
    `\r\n1. Цифры вместо слов. «Хлопок 95%», «Объём 55 л», «До −30 °C» продают лучше, чем ` +
    `«качественный» и «стильный». Впишите их в преимущества, модель вынесет их в плашки как есть.\r\n` +
    `\r\n2. Чистая обложка. Первый слайд оставьте товару без текста, инфографику ставьте со второго. ` +
    `На Ozon для одежды и обуви это требование, на Wildberries так просто кликают чаще.\r\n` +
    `\r\n3. Размеры в сантиметрах. Если товар про размер (одежда, обувь, мебель, сумки), таблица ` +
    `обхватов или длины стопы снимает половину возвратов.\r\n`;

  const promo =
    `\r\nЧтобы попробовать сразу, добавили вам 12 генов: введите промокод ${PROMO_CODE} ` +
    `в разделе «Баланс» до ${PROMO_UNTIL}. Этого хватает ровно на одну инфографику.\r\n` +
    `Баланс и промокод: ${utm("/billing", c)}\r\n` +
    `Собрать карточку: ${utm("/infographics", c)}\r\n`;

  const reading =
    `\r\nДве короткие статьи в тему:\r\n` +
    `• Как снять товар на телефон, чтобы нейросеть сделала из снимка карточку: ${utm("/blog/kak-snyat-tovar-na-telefon", c)}\r\n` +
    `• Что нельзя писать на инфографике WB, за что отклоняет модерация: ${utm("/blog/chto-nelzya-pisat-na-infografike-wb", c)}\r\n`;

  const text = `Здравствуйте!\r\n\r\n${intro}\r\n${tips}${promo}${reading}\r\nХороших продаж,\r\nKartogen\r\n${footer(r.email)}`;

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html =
    `<pre style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;white-space:pre-wrap;margin:0;color:#1d1c19">` +
    `${esc(text)}</pre>`;

  return {
    subject,
    text,
    html,
    headers: { "List-Unsubscribe": `<${unsubscribeLink(r.email)}>` },
  };
}

export function renderLetter(campaign: CampaignId, r: Recipient): MailContent {
  switch (campaign) {
    case "second-card":
      return secondCardLetter(r);
  }
}

/* ------------------------------ аудитория ------------------------------ */

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= getPool()
    .query(
      `create table if not exists marketing_sends (
         id bigserial primary key,
         campaign text not null,
         email text not null,
         variant text not null,
         sent_at timestamptz not null default now()
       );
       create index if not exists marketing_sends_campaign_email_idx on marketing_sends (campaign, email);`,
    )
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

/** Кому уйдёт кампания сейчас (уже получившие исключены). */
export async function campaignAudience(campaign: CampaignId): Promise<{
  recipients: Recipient[];
  alreadySent: number;
}> {
  await ensure();
  const subs = (await marketingSubscribers()).filter((e) => !isHiddenAccount(e));
  if (!subs.length) return { recipients: [], alreadySent: 0 };
  const db = getPool();
  const [sent, gens, bal] = await Promise.all([
    db.query<{ email: string }>(
      `select distinct email from marketing_sends where campaign = $1 and email = any($2)`,
      [campaign, subs],
    ),
    db.query<{ email: string; n: string }>(
      `select email, count(*)::text n from gen_jobs where email = any($1) and status = 'completed' group by email`,
      [subs],
    ),
    db
      .query<{
        email: string;
        balance: number;
      }>(`select email, balance from billing_balance where email = any($1)`, [subs])
      .catch(() => ({ rows: [] as { email: string; balance: number }[] })),
  ]);
  const sentSet = new Set(sent.rows.map((r) => r.email));
  const gensBy = Object.fromEntries(gens.rows.map((r) => [r.email, Number(r.n)]));
  const balBy = Object.fromEntries(bal.rows.map((r) => [r.email, Number(r.balance)]));
  const recipients = subs
    .filter((e) => !sentSet.has(e))
    .map((email) => {
      const n = gensBy[email] ?? 0;
      return {
        email,
        gens: n,
        balance: balBy[email] ?? 0,
        variant: (n > 0 ? "second" : "first") as Variant,
      };
    });
  return { recipients, alreadySent: sentSet.size };
}

/* ------------------------------ отправка ------------------------------ */

export type SendReport = {
  sent: number;
  failed: { email: string; error: string }[];
  skipped: number;
};

/**
 * Разослать кампанию всем, кому она ещё не уходила. Каждое письмо после
 * успешной отправки записывается в marketing_sends — повторный запуск
 * дошлёт только тем, кому не дошло.
 */
export async function sendCampaign(campaign: CampaignId): Promise<SendReport> {
  const { recipients, alreadySent } = await campaignAudience(campaign);
  const report: SendReport = { sent: 0, failed: [], skipped: alreadySent };
  for (const r of recipients) {
    try {
      await sendMail(r.email, renderLetter(campaign, r));
      await getPool().query(
        `insert into marketing_sends (campaign, email, variant) values ($1, $2, $3)`,
        [campaign, r.email, r.variant],
      );
      report.sent++;
    } catch (e) {
      report.failed.push({ email: r.email, error: e instanceof Error ? e.message : "ошибка" });
    }
    await new Promise((res) => setTimeout(res, PAUSE_MS));
  }
  console.log(
    `[marketing] campaign ${campaign}: sent ${report.sent}, failed ${report.failed.length}, skipped ${report.skipped}`,
  );
  return report;
}

/** Тест: оба варианта письма на один адрес (владельцу), без записи в журнал. */
export async function sendCampaignTest(campaign: CampaignId, to: string): Promise<void> {
  const variants: Variant[] = ["second", "first"];
  for (const variant of variants) {
    const mail = renderLetter(campaign, {
      email: to,
      variant,
      gens: variant === "second" ? 1 : 0,
      balance: 8,
    });
    await sendMail(to, { ...mail, subject: `[ТЕСТ ${variant}] ${mail.subject}` });
    await new Promise((res) => setTimeout(res, PAUSE_MS));
  }
}
