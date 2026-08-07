// Pure/network helpers for crawl.ts, split out so they're importable by
// tests without executing crawl.ts's CLI body (this repo's scripts run
// their CLI unconditionally at module bottom — see import-free-exercise-db.ts).
import { CRAWLER_USER_AGENT } from "./robots";

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#xD;/gi, "")
    .replace(/&#xA;/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&mdash;/gi, "—")
    .replace(/&rsquo;/gi, "’");
}

// Prefer schema.org Product JSON-LD when a page has it — structured,
// author-published facts rather than us guessing at marketing HTML.
export function extractJsonLdProduct(html: string): string | null {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const raw = decodeEntities(block[1].trim());
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const product = candidates.find(
        (c) => c && typeof c === "object" && c["@type"] === "Product",
      );
      if (product) return JSON.stringify(product, null, 2);
    } catch {
      // Not valid JSON (or not the block we want) — try the next one.
    }
  }
  return null;
}

export function stripHtml(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = decodeEntities(withoutNoise.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  const MAX = 20_000;
  return text.length > MAX ? `${text.slice(0, MAX)}…` : text;
}

export async function collectSitemapUrls(
  sitemapUrl: string,
  pathPattern: RegExp | null,
): Promise<string[]> {
  const res = await fetch(sitemapUrl, {
    headers: { "user-agent": CRAWLER_USER_AGENT },
  });
  if (!res.ok) throw new Error(`sitemap fetch ${sitemapUrl} -> ${res.status}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return pathPattern ? locs.filter((u) => pathPattern.test(u)) : locs;
}

export function slugFor(url: string): string {
  const { pathname } = new URL(url);
  return (
    pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase() || "index"
  );
}
