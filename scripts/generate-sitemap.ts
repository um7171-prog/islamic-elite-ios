// Runs before `vite dev` and `vite build` (predev/prebuild hooks); writes public/sitemap.xml.

import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://www.techsnds.com";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const entries: SitemapEntry[] = [
  { path: "/",                  changefreq: "daily",   priority: "1.0" },
  { path: "/tools",             changefreq: "weekly",  priority: "0.9" },
  { path: "/media",             changefreq: "weekly",  priority: "0.8" },
  { path: "/ai",                changefreq: "weekly",  priority: "0.9" },
  { path: "/ai/background-remover", changefreq: "monthly", priority: "0.8" },
  { path: "/ai/image-enhancer", changefreq: "monthly", priority: "0.8" },
  { path: "/ai/ocr",            changefreq: "monthly", priority: "0.8" },
  { path: "/mushaf",            changefreq: "monthly", priority: "0.9" },
  { path: "/settings",          changefreq: "monthly", priority: "0.5" },
  { path: "/athkar",            changefreq: "monthly", priority: "0.9" },
  { path: "/qibla",             changefreq: "monthly", priority: "0.9" },
  { path: "/quran",             changefreq: "monthly", priority: "0.9" },
  { path: "/tasbeeh",           changefreq: "monthly", priority: "0.8" },
  { path: "/translate",         changefreq: "monthly", priority: "0.8" },
  { path: "/prayer-times",      changefreq: "daily",   priority: "0.9" },
  { path: "/calendar",          changefreq: "weekly",  priority: "0.7" },
  { path: "/calculators",       changefreq: "monthly", priority: "0.7" },
  { path: "/date-converter",    changefreq: "monthly", priority: "0.7" },
  { path: "/convert",           changefreq: "monthly", priority: "0.8" },
  { path: "/qr-scanner",        changefreq: "monthly", priority: "0.7" },
  { path: "/document-scanner",  changefreq: "monthly", priority: "0.7" },
  { path: "/about",             changefreq: "yearly",  priority: "0.6" },
  { path: "/privacy",           changefreq: "yearly",  priority: "0.4" },
  { path: "/terms",             changefreq: "yearly",  priority: "0.4" },
  { path: "/cookies",           changefreq: "yearly",  priority: "0.4" },
  { path: "/disclaimer",        changefreq: "yearly",  priority: "0.4" },
  { path: "/faq",               changefreq: "monthly", priority: "0.7" },
  { path: "/sitemap",           changefreq: "weekly",  priority: "0.5" },
  { path: "/contact",           changefreq: "yearly",  priority: "0.5" },
];

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
