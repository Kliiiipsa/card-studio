/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint's native resolver (unrs-resolver) can't run its postinstall in this
  // environment; skip lint during build (run `npm run lint` separately if needed).
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Заголовки безопасности (аудит 2026-08-26). Строгий CSP пока не ставим —
  // его надо отдельно выверять, чтобы не сломать инлайновые стили Next;
  // здесь — безопасный набор без риска регрессий.
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
