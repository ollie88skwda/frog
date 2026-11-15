// Tier 1 brand config — the captain-greenlit set only (report.md §2.1's
// tier 1: "Commercial strength (already seeded)"). This doubles as the
// per-brand domain/ToS checklist the task requires: `verified` is only
// ever set true by hand, after actually fetching that domain's
// robots.txt and eyeballing its terms — never flip it for a brand you
// haven't personally checked, and don't widen `crawl.ts`'s default page
// cap for an unverified brand.
//
// `pathPattern` filters a fetched sitemap's <loc> entries down to product
// pages worth crawling; `seedUrls` is a fallback fixed list for brands with
// no confirmed sitemap yet. Both are deliberately narrow (a handful of
// known-good paths), matching the "don't crawl wide" constraint — widening
// either is a per-brand decision for whoever runs the real batch.
export type BrandConfig = {
  key: string;
  brand: string;
  domain: string;
  sitemapUrl: string | null;
  pathPattern: RegExp | null;
  seedUrls: string[];
  // Has a human actually fetched this domain's robots.txt and skimmed its
  // ToS for a bulk-crawl-unfriendly clause? Only "hammer-strength" (via its
  // life fitness storefront) is true today — see docs/machine-catalog-pipeline.md.
  verified: boolean;
  tosNote: string;
};

export const TIER1_BRANDS: readonly BrandConfig[] = [
  {
    key: "life-fitness",
    brand: "Life Fitness",
    domain: "www.lifefitness.com",
    sitemapUrl: "https://www.lifefitness.com/en-us/sitemap.xml",
    // Phase-2 full-line crawl: Life Fitness selectorized lines (insignia/circuit/axiom), its
    // plate-loaded line, and cable machines/functional trainers. Hammer Strength pages
    // (selectorized/hammer-strength-* and mts-*, and all of plate-loaded except life-fitness-*) are
    // excluded here — hammer-strength's own crawl owns them, so the two batches don't overlap.
    pathPattern:
      /\/en-us\/catalog\/strength-training\/(?:selectorized\/(?!hammer-strength|mts-)|plate-loaded\/life-fitness|cable-machines-functional-trainers)/,
    seedUrls: [],
    verified: true,
    tosNote:
      "robots.txt allows all but one search path, publishes per-locale sitemaps. Confirmed 2026-08 by this task; pathPattern widened for the phase-2 full-line crawl (same check), 2026-08.",
  },
  {
    key: "hammer-strength",
    brand: "Hammer Strength",
    // Hammer Strength is a Life Fitness brand in real life (report.md §4) and
    // is hosted on the same lifefitness.com storefront/sitemap — the plan's
    // recommendation is to keep them as two catalog brands, one crawl target.
    domain: "www.lifefitness.com",
    sitemapUrl: "https://www.lifefitness.com/en-us/sitemap.xml",
    // Phase-2 full-line crawl: Hammer Strength's whole footprint on the shared storefront —
    // the plate-loaded line plus the selectorized Hammer Strength Select, MTS, and MTS
    // Iso-Lateral (mts-*) lines.
    pathPattern:
      /\/en-us\/catalog\/strength-training\/(?:plate-loaded\/(?!life-fitness)|selectorized\/(?:hammer-strength|mts-))/,
    seedUrls: [],
    verified: true,
    tosNote:
      "Same domain/robots.txt as life-fitness. Product pages embed schema.org Product JSON-LD with a brand field — used to attribute rows to Hammer Strength vs. Life Fitness within the shared plate-loaded category. Confirmed 2026-08 by this task (see committed sample); pathPattern widened to cover Select + MTS selectorized lines for the phase-2 full-line crawl, 2026-08.",
  },
  {
    key: "precor",
    brand: "Precor",
    domain: "www.precor.com",
    sitemapUrl: "https://www.precor.com/sitemap.xml",
    pathPattern: null,
    seedUrls: [],
    verified: true,
    tosNote:
      "robots.txt: `Allow: /`, only /api/ + a pki-validation path disallowed; sitemap.xml published. No anti-scraping clause found in the ToS page skim. Confirmed 2026-08-07 by this task. NOTE (2026-08): precor.com's sitemap omits most of its strength products (only ~12 strength SKUs listed of 95 products); the rest are only reachable via category pages, which a companion discovery script + crawl.ts --urls-file handles (see scripts/machine-catalog/discover-precor.ts).",
  },
  {
    key: "technogym",
    brand: "Technogym",
    domain: "www.technogym.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote:
      "NOT verified 2026-08-07: technogym.com sits behind CloudFront which 403s automated requests outright (robots.txt itself is unreachable) — not bulk-crawl-amenable without special handling. Leave unverified until that's resolved or a different official source (PDF catalogs) is used.",
  },
  {
    key: "nautilus",
    brand: "Nautilus",
    // The commercial Nautilus line lives on corehandf.com (Core Health &
    // Fitness, same Shopify storefront as Cybex/Star Trac — Core bought the
    // Nautilus commercial business). nautilus.com itself is now the *home*
    // brand (vibration boards, supplements — zero strength machines), so it
    // is NOT the crawl target; batch A's nautilus.com verification was
    // correct for that domain but the products moved. Confirmed 2026-08 by
    // this task: corehandf.com's EN products sitemap carries ~140 nautilus-*
    // products (Impact/Inspiration/Leverage/Instinct/HumanSport/Plate
    // Loaded/Multi-Station lines).
    domain: "www.corehandf.com",
    // The EN products sitemap directly (not the parent index, which also
    // lists de/es/fr/pt-br products — the same machines under
    // locale-prefixed URLs, which would crawl them 5x).
    sitemapUrl:
      "https://www.corehandf.com/sitemap_products_1.xml?from=7385141248066&to=8324018110530",
    // Strength machines only: the nautilus-* product families (excludes the
    // benches-racks/benchesandracks families, SVA/bamboo platforms, half
    // racks and power cages — those are furniture/rigs, not machines; a
    // handful of Instinct benches slip through the slug test and are dropped
    // in QA review instead).
    pathPattern:
      /\/products\/nautilus-(?:impact|inspiration|leverage|instinct|humansport|plate-loaded|multi-stations|belt-squat)-/,
    seedUrls: [],
    verified: true,
    tosNote:
      "Shopify storefront on corehandf.com (Core Health & Fitness); robots.txt explicitly declares public product pages crawlable (same agents.md/UCP policy as nautilus.com). Sitemap confirmed; strength products confirmed by crawling a sample page (2026-08, this task). Domain moved from nautilus.com (home brand, no strength machines) to corehandf.com.",
  },
  {
    key: "cybex",
    brand: "Cybex",
    domain: "www.corehandf.com",
    sitemapUrl: "https://www.corehandf.com/sitemap.xml",
    pathPattern: null,
    seedUrls: [],
    verified: true,
    tosNote:
      "cybexintl.com is dead (no HTTP response); Cybex now lives at corehandf.com (Core Health & Fitness), same storefront as Star Trac. Shopify; robots.txt declares public product pages crawlable, agents.md/UCP policy. JSON-LD brand field separates Cybex from Star Trac rows within the shared storefront (same pattern as life-fitness/hammer-strength). Confirmed 2026-08-07 by this task.",
  },
  {
    key: "matrix",
    brand: "Matrix",
    domain: "www.matrixfitness.com",
    sitemapUrl: "https://world.matrixfitness.com/sitemap.xml",
    pathPattern: null,
    seedUrls: [],
    verified: true,
    tosNote:
      "robots.txt: only news/marriott/ymca paths disallowed; publishes world.matrixfitness.com/sitemap.xml. ToS page skim: no anti-scraping clause. Confirmed 2026-08-07 by this task.",
  },
  {
    key: "hoist",
    brand: "Hoist",
    domain: "www.hoistfitness.com",
    sitemapUrl: "https://www.hoistfitness.com/sitemap.xml",
    // The Shopify sitemap is ~530 URLs of which ~90% are spare parts
    // (screw/cover/washer/...) and benches/racks (cf-*). Narrow to the
    // machine families: RS (ROC-IT selectorized), RPL (plate-loaded), HD
    // (dual-function selectorized), H (multi-gyms), MI (functional
    // trainers), V/V1/V4 (elite gyms), VR/HV (leg presses), CMJ/CMD/CMS
    // (multi-station/cable), HF-43/HF-OPT (a few machines; benches are
    // cf-*/hf-5*, excluded).
    pathPattern:
      /\/products\/(?:rs-|rpl-|hd-|h-|cmj-|cmd-|cms-|vr-|hv-|hf-opt-|hf-43|mi[1-7]|mismith|v[1-4]-|v-hilo)/,
    seedUrls: [],
    verified: true,
    tosNote:
      "Shopify storefront; robots.txt explicitly declares public product pages crawlable (same agents.md/UCP policy as nautilus). sitemap.xml confirmed. Confirmed 2026-08-07 by this task.",
  },
  {
    key: "atlantis",
    brand: "Atlantis",
    domain: "www.atlantisstrength.com",
    sitemapUrl: "https://atlantisstrength.com/wp-sitemap.xml",
    // WordPress; equipment pages live under /gym-equipment/<model-code>.
    pathPattern: /\/gym-equipment\//,
    seedUrls: [],
    verified: true,
    tosNote:
      "WordPress site; robots.txt disallows only wp-admin and query-string filter paths, publishes wp-sitemap.xml. ToS page skim: no anti-scraping clause. Confirmed 2026-08-07 by this task.",
  },
  {
    key: "freemotion",
    brand: "Freemotion",
    domain: "www.freemotionfitness.com",
    sitemapUrl: "https://www.freemotionfitness.com/sitemap.xml",
    // The sitemap repeats every page across ~10 locales; anchor to the
    // default-locale strength-machine URLs only (locale-prefixed twins like
    // /es/strength-machine/... are the same machines). Racks/benches sit
    // under this path too and are dropped in QA (category "other").
    pathPattern: /^https:\/\/www\.freemotionfitness\.com\/strength-machine\//,
    seedUrls: [],
    verified: true,
    tosNote:
      "robots.txt: `Allow: /`, disallows only cart/checkout/wishlist/search/microsites paths (e-commerce chrome, not product catalog); sitemap.xml published. ToS terms page 404'd on fetch but no anti-scraping clause surfaced. Confirmed 2026-08-07 by this task.",
  },
  {
    key: "panatta",
    brand: "Panatta",
    domain: "www.panatta.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote:
      "NOT verified 2026-08-07: panatta.com redirects to a GoDaddy-branding placeholder page and panattasport.com 403s automated requests — the official domain is in flux. Re-check before any crawl; may need PDF-catalog sourcing instead.",
  },
  {
    key: "star-trac",
    brand: "Star Trac",
    domain: "www.corehandf.com",
    sitemapUrl: "https://www.corehandf.com/sitemap.xml",
    pathPattern: null,
    seedUrls: [],
    verified: true,
    tosNote:
      "startrac.com 301s to corehandf.com (Core Health & Fitness), same Shopify storefront as Cybex; robots.txt declares public product pages crawlable. JSON-LD brand field separates Star Trac from Cybex rows. Confirmed 2026-08-07 by this task.",
  },
  {
    key: "prime",
    brand: "Prime",
    domain: "www.primefitnessgroup.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote:
      "NOT verified 2026-08-07: primefitnessgroup.com resolves but serves no HTTP response (site unreachable), so robots.txt/ToS cannot be checked and a crawl would fail anyway. Domain itself unconfirmed — re-check before any attempt.",
  },
  {
    key: "gym80",
    brand: "Gym80",
    // gym80.com lapsed and is now a GoDaddy aftermarket parking page (the
    // batch-A verification hit the real site; it has since lapsed). The
    // company's live site is gym80.de — WordPress, products under
    // /en/product/<id>/ (German /produkt/<id>/ twins excluded via
    // pathPattern). Confirmed 2026-08 by this task.
    domain: "gym80.de",
    sitemapUrl: "https://gym80.de/sitemap.xml",
    pathPattern: /\/en\/product\/\d+\//,
    seedUrls: [],
    verified: true,
    tosNote:
      "gym80.de (gym80.com lapsed — GoDaddy parking page, see tosNote history). WordPress; robots.txt disallows only wp-admin; publishes sitemap.xml with fitness_equipment sitemaps. Product pages carry model name + technical data (dimensions/weight/load) in HTML. ToS page skim: no anti-scraping clause. Confirmed 2026-08 by this task.",
  },
  {
    key: "arsenal-strength",
    brand: "Arsenal Strength",
    domain: "www.arsenalstrength.com",
    sitemapUrl: "https://arsenalstrength.com/sitemap_index.xml",
    pathPattern: null,
    seedUrls: [],
    verified: true,
    tosNote:
      "WordPress site; robots.txt disallows only wp-admin, publishes sitemap_index.xml. ToS page skim: no anti-scraping clause. Confirmed 2026-08-07 by this task.",
  },
] as const;

export function brandConfig(key: string): BrandConfig {
  const found = TIER1_BRANDS.find((b) => b.key === key);
  if (!found) {
    throw new Error(
      `unknown brand key "${key}" — add it to TIER1_BRANDS in scripts/machine-catalog/brands.ts first`,
    );
  }
  return found;
}

// Brand-name canonicalization: raw strings seen in the wild (a page's own
// JSON-LD brand field, a PDF header, a retailer listing) -> the one display
// string every staging row should carry. Keys are matched case-insensitively
// after trimming — see normalize.ts.
export const BRAND_CANONICAL: Record<string, string> = {
  "life fitness": "Life Fitness",
  lifefitness: "Life Fitness",
  "life fitness inc": "Life Fitness",
  "hammer strength": "Hammer Strength",
  hammerstrength: "Hammer Strength",
  precor: "Precor",
  technogym: "Technogym",
  nautilus: "Nautilus",
  cybex: "Cybex",
  "cybex international": "Cybex",
  matrix: "Matrix",
  "matrix fitness": "Matrix",
  hoist: "Hoist",
  "hoist fitness": "Hoist",
  atlantis: "Atlantis",
  "atlantis strength": "Atlantis",
  freemotion: "Freemotion",
  "free motion": "Freemotion",
  panatta: "Panatta",
  "panatta sport": "Panatta",
  "star trac": "Star Trac",
  startrac: "Star Trac",
  prime: "Prime",
  "prime fitness": "Prime",
  gym80: "Gym80",
  "gym 80": "Gym80",
  "arsenal strength": "Arsenal Strength",
  arsenal: "Arsenal Strength",
};
