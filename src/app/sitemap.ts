import type { MetadataRoute } from "next";
import { allPosts } from "@/core/blog/posts";

const SITE_URL = process.env.SITE_URL || "https://kartogen.ru";

export default function sitemap(): MetadataRoute.Sitemap {
  const blog: MetadataRoute.Sitemap = allPosts().map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.date,
    changeFrequency: "monthly",
    priority: 0.7,
  }));
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/wildberries`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/check`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/help`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
    ...blog,
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/offer`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
