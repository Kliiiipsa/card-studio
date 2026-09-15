import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL || "https://kliiiipsa-card-studio-30da.twc1.net";

/** Search engines: index the landing, keep the studio internals out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
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
          "/check",
          "/blog",
          "/examples/",
          "/terms",
          "/offer",
          "/privacy",
          "/pricing",
        ],
        disallow: [
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
          "/seo",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
