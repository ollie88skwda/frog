// Precor product discovery — a per-brand companion to crawl.ts.
//
// precor.com's sitemap omits most of its strength products (only ~12 of 95
// en-US product SKUs are strength machines; the Discovery/Vitality/Resolute
// lines are largely absent). The strength catalog is instead embedded, as
// Contentful JSON, inside the /en-US/strength/* category pages that the
// sitemap DOES list. This script fetches those category pages, extracts
// (product name, product URL) pairs from the embedded JSON, filters to
// strength machines (drops cardio + benches/racks/accessories by name), and
// unions the result with the sitemap's en-US product URLs.
//
// Output: <staging>/raw/precor/discovered-urls.txt — feed it to
// crawl.ts with --urls-file. Not part of the standard pipeline stages; it
// exists because precor's sitemap cannot be crawled product-complete on its
// own (see brands.ts precor tosNote).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { brandConfig } from "./brands";
import { collectSitemapUrls } from "./crawl-lib";
import { rawDir } from "./paths";
import { CRAWLER_USER_AGENT, fetchRobots, isAllowed } from "./robots";

const LOCALE = "en-US";
const BASE = `https://www.precor.com/${LOCALE}`;

// Names that are NOT a fixed strength machine: cardio equipment, benches,
// racks, free-weight furniture, and accessories. Anything whose product
// name contains one of these is dropped. "bench" is special-cased (a
// "bench press" IS a station; a bare "bench" is furniture).
const EXCLUDE: { re: RegExp; note: string }[] = [
  {
    re: /\b(treadmill|elliptical|bike|cycling|cycle|stairclimber|stair\b|stepper|climber|rower|cross[- ]trainer|arc trainer|ergometer|assault)\b/i,
    note: "cardio",
  },
  { re: /\b(console|screen|tv|monitor|display)\b/i, note: "console" },
  {
    re: /\b(dumbbell|barbell|tree|stool|mat|pad|cushion|strap|band|ball|roller|tube|tubing|sledge|sled|bag|box|rope|kettlebell|medicine|sandbag|suspension|tire|landmine|wheel|mirror|hook|anchor|storage|shelf|fan|towel|wedge|stand|post)\b/i,
    note: "accessory/furniture",
  },
  { re: /\b(rack|power cage|cage|rig)\b/i, note: "rack/rig" },
  { re: /\b(sissy|pilates|reformer|yoga|stretch)\b/i, note: "specialty" },
];

// SKU prefixes of the strength-machine families seen on precor.com's en-US
// sitemap (verified by fetching page titles): VSL Vitality selectorized,
// GSL/GPL GluteBuilder, DPL Discovery plate-loaded, RUD Resolute (cable
// stations), VBR Vitality benches+Abdominal Trainer (the trainer is a
// machine; the benches are dropped in QA). Everything else in the sitemap
// is cardio (TRM/EFX/AMT/RBK/UBK/SCL/STM/P/PX/SC) or benches/racks
// (DBR/GBR) — skip those without fetching them.
const STRENGTH_SKU_PREFIX = /^(VSL|GSL|GPL|DPL|RUD|VBR)/i;

function keepName(name: string): boolean {
  // "bench" is only excluded when it isn't a "bench press" station.
  if (/\bbench\b/i.test(name) && !/\bpress\b/i.test(name)) return false;
  for (const { re } of EXCLUDE) {
    if (re.test(name)) return false;
  }
  return true;
}

// Extract (name, url) pairs from a Precor page's embedded Contentful JSON.
// Product cards appear as {"name":"<NAME>", ... "url":"https://www.precor.com/en-US/products/<SKU>"}
// with the url trailing the name by up to a few KB of image/asset data.
const PAIR_RE =
  /\\"name\\":\\"([^\\"]+)\\"[\s\S]{0,3000}?\\"url\\":\\"https:\/\/www\.precor\.com\/en-US\/products\/([A-Za-z0-9]+)\\/g;

function discoverFromPage(html: string): { name: string; sku: string }[] {
  const found = new Map<string, { name: string; sku: string }>();
  for (const m of html.matchAll(PAIR_RE)) {
    const name = m[1].trim();
    const sku = m[2];
    if (!found.has(sku)) found.set(sku, { name, sku });
  }
  return [...found.values()];
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "user-agent": CRAWLER_USER_AGENT },
  });
  if (!res.ok) return null;
  return res.text();
}

async function main() {
  const config = brandConfig("precor");
  if (!config.verified) {
    console.error("precor is not verified — refusing discovery");
    process.exit(1);
  }
  const policy = await fetchRobots(config.domain);
  const delayMs = Number(process.env.FROG_CRAWL_DELAY_MS ?? 1000);
  let lastFetch = 0;
  const rate = async () => {
    const now = Date.now();
    const wait = delayMs - (now - lastFetch);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetch = Date.now();
  };

  // 1) All en-US sitemap URLs, split into category pages (to discover
  //    products from) and product pages (crawl candidates directly).
  const sitemapUrls = await collectSitemapUrls(config.sitemapUrl!, null);
  const categoryUrls = sitemapUrls.filter((u) =>
    new URL(u).pathname.startsWith(`/${LOCALE}/strength/`),
  );
  const productUrls = sitemapUrls.filter((u) =>
    new URL(u).pathname.startsWith(`/${LOCALE}/products/`),
  );
  console.error(
    `sitemap: ${productUrls.length} product pages, ${categoryUrls.length} strength category pages`,
  );

  // 2) Discover products embedded in the category pages.
  const discovered = new Map<string, string>(); // sku -> name
  for (const url of categoryUrls) {
    const { pathname } = new URL(url);
    if (!isAllowed(policy, pathname)) {
      console.error(`  skip (robots) ${pathname}`);
      continue;
    }
    await rate();
    const html = await fetchText(url);
    if (!html) {
      console.error(`  skip (HTTP) ${url}`);
      continue;
    }
    const pairs = discoverFromPage(html);
    console.error(`  ${pathname}: ${pairs.length} product(s)`);
    for (const p of pairs) discovered.set(p.sku, p.name);
  }

  // 3) Union: sitemap strength-SKU product pages + discovered pages that
  //    look like strength machines (drop cardio/benches/racks/accessories
  //    by name).
  const urls = new Map<string, string>();
  for (const u of productUrls) {
    const sku = u.split("/").pop()!;
    if (!STRENGTH_SKU_PREFIX.test(sku)) {
      console.error(`  skip (sitemap, non-strength SKU) ${sku}`);
      continue;
    }
    const name = discovered.get(sku) ?? sku;
    if (!keepName(name)) {
      console.error(`  drop (sitemap, ${name}) ${sku}`);
      continue;
    }
    urls.set(u, name);
  }
  for (const [sku, name] of discovered) {
    if (!keepName(name)) {
      console.error(`  drop (discovered, ${name}) ${sku}`);
      continue;
    }
    urls.set(`${BASE}/products/${sku}`, name);
  }

  // 4) Write the crawl list.
  const outPath = join(rawDir("precor"), "discovered-urls.txt");
  mkdirSync(dirname(outPath), { recursive: true });
  const sorted = [...urls.keys()].sort();
  writeFileSync(outPath, `${sorted.join("\n")}\n`, "utf8");

  console.error(
    `\ndiscovery done: ${sorted.length} strength product URLs -> ${outPath}`,
  );
  for (const [sku, name] of [...discovered.entries()].sort()) {
    console.error(`  ${sku}: ${name}`);
  }
}

await main();
