/**
 * IndexNow: сообщить Bing и Яндексу о страницах сайта (30.09.2026).
 *
 * Зачем: поиск ChatGPT берёт результаты из индекса Bing, а Bing на 30.09.2026
 * не знал о kartogen.ru вообще (site:kartogen.ru — ноль результатов), хотя
 * ChatGPT уже приводил людей. IndexNow — открытый протокол: ключ лежит файлом
 * в корне сайта (public/<key>.txt), один POST отдаёт список адресов, Bing и
 * Яндекс забирают его сами. Кабинет вебмастера для этого не нужен.
 *
 * Запуск: node scripts/indexnow.mjs            — все адреса из sitemap
 *         node scripts/indexnow.mjs /ozon /wb  — только указанные пути
 * Ключ берётся из файла public/*.txt с 32 hex-символами в имени.
 */
import { readdirSync } from "node:fs";

const SITE = "https://kartogen.ru";
const key = readdirSync(new URL("../public", import.meta.url))
  .map((f) => /^([0-9a-f]{32})\.txt$/.exec(f)?.[1])
  .find(Boolean);
if (!key) {
  console.error("ключ IndexNow не найден: нужен public/<32 hex>.txt");
  process.exit(1);
}

let urls = process.argv.slice(2).map((p) => (p.startsWith("http") ? p : SITE + p));
if (!urls.length) {
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
if (!urls.length) {
  console.error("адресов нет");
  process.exit(1);
}

// проверяем, что ключ уже отдаётся сайтом — иначе поисковики отклонят заявку
const keyRes = await fetch(`${SITE}/${key}.txt`);
const keyBody = (await keyRes.text()).trim();
if (keyRes.status !== 200 || keyBody !== key) {
  console.error(
    `файл ключа не отдаётся: ${keyRes.status} «${keyBody.slice(0, 40)}» — сначала выложите сайт`,
  );
  process.exit(1);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: "kartogen.ru",
    key,
    keyLocation: `${SITE}/${key}.txt`,
    urlList: urls,
  }),
});
// 200/202 — принято; 422 — ключ не подтверждён; 429 — слишком часто
console.log(`IndexNow: ${res.status} ${res.statusText} — отправлено адресов: ${urls.length}`);
if (res.status >= 400) console.log(await res.text());
