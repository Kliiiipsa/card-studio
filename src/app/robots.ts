import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL || "https://kliiiipsa-card-studio-30da.twc1.net";

/** Search engines: index the landing, keep the studio internals out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/examples/"],
        disallow: [
          "/api/",
          "/dashboard",
          "/generator",
          "/infographics",
          "/analysis",
          "/cards",
          "/billing",
          "/settings",
          "/admin",
          "/login",
          "/register",
          "/projects/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
