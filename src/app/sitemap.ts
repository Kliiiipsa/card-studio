import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL || "https://kartogen.ru";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/help`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/offer`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
