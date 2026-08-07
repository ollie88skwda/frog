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
    .replace(/&#x27;/g, "'")
    .replace(/&#x9;/gi, "\t")
    .replace(/&#xD;/gi, "")
    .replace(/&#xA;/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&mdash;/gi, "—")
    .replace(/&#x2014;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#x2013;/gi, "–")
    .replace(/&rsquo;/gi, "’")
    .replace(/&#x2019;/gi, "’")
    .replace(/&#x201C;/gi, '"')
    .replace(/&#x201D;/gi, '"')
    .replace(/&reg;/gi, "®")
    .replace(/&#xAE;/gi, "®")
    .replace(/&trade;/gi, "™")
    .replace(/&#x2122;/gi, "™")
    .replace(/&deg;/gi, "°")
    .replace(/&#xB0;/gi, "°");
}

// Prefer schema.org Product JSON-LD when a page has it — structured,
// author-published facts rather than us guessing at marketing HTML.
export function extractJsonLdProduct(html: string): string | null {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const raw = block[1].trim();
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const product = candidates.find(
        (c) =>
          c &&
          typeof c === "object" &&
          (c["@type"] === "Product" ||
            (Array.isArray(c["@type"]) &&
              (c["@type"] as string[]).includes("Product"))),
      );
      if (product) {
        // JSON-LD script bodies may entity-encode their string values
        // (&lt;, &amp;, &quot;, ...) — decode AFTER parsing, never before:
        // pre-decoding turns a &quot; inside a string value into a raw quote
        // and JSON.parse throws "Unterminated string".
        for (const key of ["name", "description"]) {
          const v = (product as Record<string, unknown>)[key];
          if (typeof v === "string")
            (product as Record<string, unknown>)[key] = decodeEntities(v);
        }
        const brand = (product as Record<string, unknown>).brand;
        if (typeof brand === "string") {
          (product as Record<string, unknown>).brand = decodeEntities(brand);
        } else if (brand && typeof brand === "object") {
          const bname = (brand as { name?: unknown }).name;
          if (typeof bname === "string")
            (brand as { name: string }).name = decodeEntities(bname);
        }
        return JSON.stringify(product, null, 2);
      }
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
