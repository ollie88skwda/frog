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
    pathPattern: /\/en-us\/catalog\/strength-training\//,
    seedUrls: [],
    verified: true,
    tosNote:
      "robots.txt allows all but one search path, publishes per-locale sitemaps. Confirmed 2026-08 by this task.",
  },
  {
    key: "hammer-strength",
    brand: "Hammer Strength",
    // Hammer Strength is a Life Fitness brand in real life (report.md §4) and
    // is hosted on the same lifefitness.com storefront/sitemap — the plan's
    // recommendation is to keep them as two catalog brands, one crawl target.
    domain: "www.lifefitness.com",
    sitemapUrl: "https://www.lifefitness.com/en-us/sitemap.xml",
    pathPattern: /\/en-us\/catalog\/strength-training\/plate-loaded\//,
    seedUrls: [],
    verified: true,
    tosNote:
      "Same domain/robots.txt as life-fitness. Product pages embed schema.org Product JSON-LD with a brand field — used to attribute rows to Hammer Strength vs. Life Fitness within the shared plate-loaded category. Confirmed 2026-08 by this task (see committed sample).",
  },
  {
    key: "precor",
    brand: "Precor",
    domain: "www.precor.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
  },
  {
    key: "technogym",
    brand: "Technogym",
    domain: "www.technogym.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
  },
  {
    key: "nautilus",
    brand: "Nautilus",
    domain: "www.nautilus.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote:
      "robots.txt spot-checked and is a Shopify storefront with an explicit agent-friendly crawl policy, but the full product catalog/ToS was not reviewed — verify before crawling.",
  },
  {
    key: "cybex",
    brand: "Cybex",
    domain: "www.cybexintl.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
  },
  {
    key: "matrix",
    brand: "Matrix",
    domain: "www.matrixfitness.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
  },
  {
    key: "hoist",
    brand: "Hoist",
    domain: "www.hoistfitness.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
  },
  {
    key: "atlantis",
    brand: "Atlantis",
    domain: "www.atlantisstrength.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
  },
  {
    key: "freemotion",
    brand: "Freemotion",
    domain: "www.freemotionfitness.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
  },
  {
    key: "panatta",
    brand: "Panatta",
    domain: "www.panatta.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
  },
  {
    key: "star-trac",
    brand: "Star Trac",
    domain: "www.startrac.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
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
      "Not yet checked — verify robots.txt and ToS before crawling. Domain guessed, not confirmed.",
  },
  {
    key: "gym80",
    brand: "Gym80",
    domain: "www.gym80.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
  },
  {
    key: "arsenal-strength",
    brand: "Arsenal Strength",
    domain: "www.arsenalstrength.com",
    sitemapUrl: null,
    pathPattern: null,
    seedUrls: [],
    verified: false,
    tosNote: "Not yet checked — verify robots.txt and ToS before crawling.",
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
