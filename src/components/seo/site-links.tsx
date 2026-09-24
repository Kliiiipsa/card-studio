import Link from "next/link";

/**
 * Блок внутренних ссылок на все публичные посадочные и справочники.
 *
 * Зачем: разбор 15.09.2026 показал, что посадочные были «сиротами» — на них
 * не ссылались ни главная, ни блог, ни /help, только sitemap и они сами друг
 * на друга. Bing и DuckDuckGo проиндексировали ровно две страницы (главную и
 * /check — единственную, на которую вела ссылка с главной), а Яндекс держал
 * посадочные за 50-й позицией по головным запросам. Внутренняя ссылка — это
 * вес страницы внутри сайта; без неё поисковик считает её второстепенной.
 *
 * Один источник правды: добавили посадочную — добавьте её сюда, и она получит
 * ссылку с каждой публичной страницы.
 */
export const SITE_LINK_GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Инструменты",
    links: [
      { href: "/generator-kartochek", label: "Генератор карточек товара" },
      { href: "/photo", label: "Фото товара нейросетью" },
      { href: "/neuroset-infografika", label: "Нейросеть для инфографики" },
      { href: "/check", label: "Бесплатный анализ карточки" },
      { href: "/video-dlya-kartochki-tovara", label: "Видео для карточки товара" },
    ],
  },
  {
    title: "Гайды",
    links: [
      { href: "/dizayn-kartochki-tovara", label: "Дизайн карточки товара" },
      { href: "/seo-opisanie-tovara", label: "SEO-описание для карточки" },
      { href: "/infografika-marketplace", label: "Инфографика для маркетплейсов" },
      { href: "/infografika", label: "Инфографика для карточки Wildberries" },
      { href: "/wildberries", label: "Карточки для Wildberries" },
      { href: "/ozon", label: "Карточки для Ozon" },
    ],
  },
  {
    title: "Справочники",
    links: [
      { href: "/razmer-kartochki-wildberries", label: "Размер карточки Wildberries" },
      { href: "/razmer-kartochki-ozon", label: "Размер карточки Ozon" },
      { href: "/trebovaniya-k-foto-ozon", label: "Требования к фото Ozon" },
      { href: "/help", label: "Как это работает" },
      { href: "/blog", label: "Блог" },
      { href: "/pricing", label: "Тарифы" },
    ],
  },
];

export function SiteLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Разделы сайта" className={className}>
      <div className="grid gap-6 sm:grid-cols-3">
        {SITE_LINK_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {g.title}
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-foreground/80 hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
