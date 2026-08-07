// Stage 1: crawler. Fetches a brand's current catalog — sitemap-driven HTML
// crawl by default, downloading any linked PDF spec sheets/catalogs
// verbatim (report.md §4 prefers PDFs where available; this scaffold
// fetches whatever a brand's configured product pages link to rather than
// hunting for a separate PDF catalog download, which is brand-specific
// enough to be a follow-up, not this pass).
//
// Respects robots.txt (robots.ts) and rate-limits requests to one host at a
// time (FROG_CRAWL_DELAY_MS, default 1000ms). Writes everything to a
// gitignored staging dir (scripts/machine-catalog/staging/raw/<brand>/) —
// never committed; the committed reference example under
// scripts/machine-catalog/sample/ was produced by this same script with
// FROG_MC_ROOT pointed at that directory instead (see paths.ts's header and
// docs/machine-catalog-pipeline.md).
//
// PDF text extraction is NOT implemented here — this environment has no
// `pdftotext`/PDF-parsing library available or vendored, so a fetched PDF
// is staged as raw bytes only (RawBinary) and extract.ts skips it with a
// clear note rather than silently dropping it. Wiring real PDF-to-text is
// flagged as a follow-up in the pipeline doc.
//
// Usage: bun scripts/machine-catalog/crawl.ts <brandKey> [--limit N] [--urls-file path]
//
// --urls-file: a newline-delimited file of exact URLs to crawl instead of
// the brand's sitemap/seedUrls. Used when a brand's sitemap is incomplete
// for the target category (Precor's sitemap omits most of its strength
// products — a companion discovery script collects them from the category
// pages instead) or when a storefront's product list needs hand-curation
// (Hoist's sitemap is 90% spare parts). robots.txt and rate limits still
// apply to every URL in the file.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brandConfig } from "./brands";
import {
  collectSitemapUrls,
  extractJsonLdProduct,
  slugFor,
  stripHtml,
} from "./crawl-lib";
import { manifestPath, rawDir } from "./paths";
import {
  CRAWLER_USER_AGENT,
  createRateLimiter,
  fetchRobots,
  isAllowed,
} from "./robots";
import type { CrawlManifest, RawDocument } from "./types";

const DEFAULT_LIMIT = 5; // scaffold default — "a working scaffold, not the full crawl"

async function main() {
  const brandKey = process.argv[2];
  if (!brandKey) {
    console.error(
      "usage: bun scripts/machine-catalog/crawl.ts <brandKey> [--limit N]",
    );
    process.exit(1);
  }
  const limitFlagIdx = process.argv.indexOf("--limit");
  const limit =
    limitFlagIdx !== -1
      ? Number(process.argv[limitFlagIdx + 1])
      : DEFAULT_LIMIT;
  const delayMs = Number(process.env.FROG_CRAWL_DELAY_MS ?? 1000);

  const urlsFileIdx = process.argv.indexOf("--urls-file");
  const urlsFile = urlsFileIdx !== -1 ? process.argv[urlsFileIdx + 1] : null;

  const config = brandConfig(brandKey);
  if (!config.verified) {
    console.error(
      `refusing to crawl "${brandKey}": brands.ts marks it unverified (no confirmed robots.txt/ToS check yet). ` +
        `Verify the domain by hand and flip \`verified: true\` in brands.ts before crawling it.`,
    );
    process.exit(1);
  }

  const policy = await fetchRobots(config.domain);
  const rate = createRateLimiter(delayMs);

  const candidateUrls = urlsFile
    ? readFileSync(urlsFile, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : config.sitemapUrl
      ? await collectSitemapUrls(config.sitemapUrl, config.pathPattern)
      : config.seedUrls;
  const urls = candidateUrls.slice(0, limit);

  const manifest: CrawlManifest = {
    brandKey,
    crawledAt: new Date().toISOString(),
    sourceListUrl: urlsFile ?? config.sitemapUrl,
    documents: [],
    binaries: [],
    skipped: [],
  };

  const outDir = rawDir(brandKey);
  mkdirSync(outDir, { recursive: true });

  for (const url of urls) {
    const { pathname } = new URL(url);
    if (!isAllowed(policy, pathname)) {
      manifest.skipped.push({ url, reason: "disallowed by robots.txt" });
      continue;
    }

    await rate();
    let res: Response;
    try {
      res = await fetch(url, { headers: { "user-agent": CRAWLER_USER_AGENT } });
    } catch (err) {
      manifest.skipped.push({
        url,
        reason: `fetch failed: ${(err as Error).message}`,
      });
      continue;
    }
    if (!res.ok) {
      manifest.skipped.push({ url, reason: `HTTP ${res.status}` });
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const fetchedAt = new Date().toISOString();

    if (contentType.includes("pdf")) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const fileName = `${slugFor(url)}.pdf`;
      writeFileSync(join(outDir, fileName), bytes);
      manifest.binaries.push({
        url,
        brandKey,
        fetchedAt,
        contentType,
        filePath: fileName,
        bytes: bytes.byteLength,
      });
      continue;
    }

    const html = await res.text();
    const jsonld = extractJsonLdProduct(html);
    const document: RawDocument = jsonld
      ? {
          url,
          brandKey,
          fetchedAt,
          contentType,
          extractionMethod: "jsonld-product",
          text: jsonld,
        }
      : {
          url,
          brandKey,
          fetchedAt,
          contentType,
          extractionMethod: "stripped-html",
          text: stripHtml(html),
        };
    manifest.documents.push(document);
  }

  const outPath = manifestPath(brandKey);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.error(
    `crawled "${brandKey}": ${manifest.documents.length} pages, ${manifest.binaries.length} binaries, ` +
      `${manifest.skipped.length} skipped -> ${outPath}`,
  );
}

await main();
