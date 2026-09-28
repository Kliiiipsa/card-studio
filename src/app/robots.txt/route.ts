const SITE_URL = process.env.SITE_URL || "https://kartogen.ru";

export const dynamic = "force-static";

/**
 * robots.txt руками, а не через MetadataRoute.Robots: Next не умеет отдавать
 * директиву Clean-param, а она нам нужна.
 *
 * Clean-param (Яндекс, 28.09.2026): робот ходил по «главная?etext=…&ybaip=1»
 * как по отдельным страницам — это метки, которые Яндекс сам вешает на
 * переходы из своего поиска и рекламы, а Метрика отдаёт их роботу. На
 * маленьком сайте такие копии съедали почти весь обход, до настоящих страниц
 * робот доходил реже. Директива межсекционная — место в файле не важно;
 * Google её игнорирует, для него склейку делает canonical на каждой странице.
 *
 * «/seo$» вместо «/seo»: раздел SEO-текстов закрыт, а посадочная
 * /seo-opisanie-tovara открыта. Более длинный Allow и так побеждал, но с «$»
 * правило не зависит от порядка и длины.
 */
const ALLOW = [
  "/",
  "/help",
  "/wildberries",
  "/ozon",
  "/photo",
  "/infografika",
  "/neuroset-infografika",
  "/infografika-marketplace",
  "/dizayn-kartochki-tovara",
  "/generator-kartochek",
  "/razmer-kartochki-wildberries",
  "/trebovaniya-k-foto-ozon",
  "/razmer-kartochki-ozon",
  "/seo-opisanie-tovara",
  "/video-dlya-kartochki-tovara",
  "/check",
  "/blog",
  "/examples/",
  "/terms",
  "/offer",
  "/privacy",
  "/pricing",
];

const DISALLOW = [
  "/api/",
  "/dashboard",
  "/generator",
  "/infographics",
  "/banners",
  "/analysis",
  "/cards",
  "/billing",
  "/settings",
  "/admin",
  "/unsubscribe",
  "/login",
  "/register",
  "/turnkey",
  "/invite",
  "/seo$",
  "/seo?",
];

/** метки переходов Яндекса и рекламные utm — не отдельные страницы */
const CLEAN_PARAMS = [
  "etext",
  "ybaip",
  "yclid",
  "ysclid",
  "from",
  "_openstat",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

export function GET() {
  const lines = [
    "User-Agent: *",
    ...ALLOW.map((p) => `Allow: ${p}`),
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    "",
    `Clean-param: ${CLEAN_PARAMS.join("&")} /`,
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
