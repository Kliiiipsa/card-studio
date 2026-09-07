/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // src/instrumentation.ts выполняется один раз при старте сервера (мониторы
  // рантайма + страховка от падения процесса). В Next 14.2 нужен явный флаг.
  experimental: { instrumentationHook: true },
  // ESLint's native resolver (unrs-resolver) can't run its postinstall in this
  // environment; skip lint during build (run `npm run lint` separately if needed).
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    // Контейнер Timeweb не даёт писать в /app/.next/cache/images (EACCES),
    // поэтому Next переоптимизировал КАЖДУЮ картинку на каждый запрос —
    // лишняя нагрузка на 1-CPU и спам в логах. Отдаём картинки как есть:
    // они уже небольшие, а процессор бережём. Кэш-ошибки исчезают.
    unoptimized: true,
  },
  // Заголовки безопасности (аудит 2026-08-26). Строгий CSP пока не ставим —
  // его надо отдельно выверять, чтобы не сломать инлайновые стили Next;
  // здесь — безопасный набор без риска регрессий.
  // 301 с постов блога, которые почти дословно повторяли справочные страницы
  // (2026-09-07). Две страницы про один запрос конкурируют между собой, и
  // поисковик занижает обе; уникальные факты из постов перенесены в справочники,
  // а вес старых адресов переходит на них. Не удалять: ссылки на посты могли
  // разойтись по чатам и остаться в индексе.
  async redirects() {
    return [
      {
        source: "/blog/razmer-infografiki-wildberries-2026",
        destination: "/razmer-kartochki-wildberries",
        statusCode: 301,
      },
      {
        source: "/blog/razmer-infografiki-ozon-2026",
        destination: "/trebovaniya-k-foto-ozon",
        statusCode: 301,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // запрет встраивания сайта в iframe — защита от кликджекинга на оплате
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
