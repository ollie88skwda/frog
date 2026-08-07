// Unit tests for the machine-catalog pipeline's pure logic. Not part of
// `bun run test` (that filter only runs the three workspace packages —
// apps/web, packages/core, packages/mcp — per package.json; scripts/ is
// intentionally outside every workspace). Run directly:
//   bun test scripts/machine-catalog
import { describe, expect, test } from "bun:test";
import {
  decodeEntities,
  extractJsonLdProduct,
  slugFor,
  stripHtml,
} from "./crawl-lib";
import {
  cleanModelName,
  inferCategory,
  inferMechanism,
  mockExtractOne,
  toStagingMachine,
} from "./extract-lib";
import { generateSql, idFor, rowSql } from "./migration-lib";
import { aliasesForModel } from "./model-aliases";
import {
  canonicalizeBrand,
  dedupeKey,
  normalizeMachine,
} from "./normalize-lib";
import { findDupes, sample } from "./qa-lib";
import { isAllowed, parseRobots } from "./robots";
import type { RawDocument, StagingMachine } from "./types";

function machine(overrides: Partial<StagingMachine> = {}): StagingMachine {
  return {
    brand: "Hammer Strength",
    model: "Iso-Lateral Row",
    aliases: null,
    category: "row",
    mechanism: "plate-loaded",
    muscleTargets: null,
    weightStackKg: null,
    plateCapacityKg: null,
    dimensions: null,
    productUrl: "https://example.com/iso-lateral-row",
    introducedYear: null,
    discontinuedYear: null,
    sourceUrl: "https://example.com/iso-lateral-row",
    sourceNote: null,
    ...overrides,
  };
}

describe("robots.ts", () => {
  test("parses a User-agent: * group and respects longest-match-wins", () => {
    const policy = parseRobots(
      [
        "User-agent: *",
        "Disallow: /search",
        "Disallow: /catalog/private",
        "Allow: /catalog/private/public-ok",
        "Sitemap: https://example.com/sitemap.xml",
      ].join("\n"),
    );
    expect(policy.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
    expect(isAllowed(policy, "/catalog/strength-training/foo")).toBe(true);
    expect(isAllowed(policy, "/search/whatever")).toBe(false);
    expect(isAllowed(policy, "/catalog/private/secret")).toBe(false);
    // Allow is more specific (longer) than the Disallow it sits under.
    expect(isAllowed(policy, "/catalog/private/public-ok/page")).toBe(true);
  });

  test("only applies rules from the '*' group, not a named-agent-only group", () => {
    const policy = parseRobots(
      [
        "User-agent: SomeOtherBot",
        "Disallow: /everything",
        "User-agent: *",
        "Disallow: /only-this",
      ].join("\n"),
    );
    expect(isAllowed(policy, "/everything")).toBe(true);
    expect(isAllowed(policy, "/only-this")).toBe(false);
  });

  test("no matching rule -> allowed", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /admin");
    expect(isAllowed(policy, "/catalog")).toBe(true);
  });
});

describe("normalize-lib.ts", () => {
  test("canonicalizeBrand maps known variants, passes through unknowns trimmed", () => {
    expect(canonicalizeBrand("hammer strength")).toBe("Hammer Strength");
    expect(canonicalizeBrand("  LifeFitness ")).toBe("Life Fitness");
    expect(canonicalizeBrand("Some Unlisted Brand")).toBe(
      "Some Unlisted Brand",
    );
  });

  test("normalizeMachine canonicalizes brand and merges derived aliases without dupes", () => {
    const m = machine({
      brand: "hammer strength",
      model: "Iso-Lateral Row",
      aliases: ["ISO-Lateral"],
    });
    const out = normalizeMachine(m);
    expect(out.brand).toBe("Hammer Strength");
    expect(out.aliases).toEqual(["ISO-Lateral"]);
  });

  test("dedupeKey is case/whitespace-insensitive on (brand, model)", () => {
    const a = machine({ brand: "Hammer Strength", model: "Iso-Lateral Row" });
    const b = machine({
      brand: " hammer strength ",
      model: " ISO-LATERAL ROW ",
    });
    expect(dedupeKey(a)).toBe(dedupeKey(b));
  });
});

describe("model-aliases.ts", () => {
  test("aliasesForModel matches known family substrings, case-insensitively", () => {
    expect(aliasesForModel("Plate Loaded Iso-Lateral Row")).toContain(
      "ISO-Lateral",
    );
    expect(aliasesForModel("Reverse V-Squat")).toContain("V-Squat");
    expect(aliasesForModel("Leg Extension")).toEqual([]);
  });
});

describe("qa-lib.ts", () => {
  test("sample is deterministic for a given seed and respects pct/min-1", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const a = sample(items, 10, 42);
    const b = sample(items, 10, 42);
    expect(a).toEqual(b);
    expect(a.length).toBe(2); // 10% of 20
    expect(sample(items, 1, 1).length).toBe(1); // rounds down to 0 -> floored to min 1
  });

  test("sample on an empty batch returns empty, not a crash", () => {
    expect(sample([], 10, 1)).toEqual([]);
  });

  test("findDupes groups by normalized (brand, model) and only reports groups >1", () => {
    const rows = [
      machine({ model: "Iso-Lateral Row" }),
      machine({ model: "iso-lateral row" }), // same after normalize -> dupe
      machine({ model: "Reverse V-Squat" }), // unique
    ];
    const dupes = findDupes(rows);
    expect(dupes.length).toBe(1);
    expect(dupes[0].length).toBe(2);
  });
});

describe("extract-lib.ts", () => {
  test("inferCategory / inferMechanism read keywords case-insensitively", () => {
    expect(inferCategory("Plate Loaded Iso-Lateral Row")).toBe("row");
    expect(inferCategory("Reverse V-Squat")).toBe("squat-machine");
    expect(inferCategory("Something Unrelated")).toBe("other");
    expect(inferMechanism("Plate Loaded Super Squat Press")).toBe(
      "plate-loaded",
    );
    expect(inferMechanism("no mechanism words here")).toBe(null);
  });

  test("cleanModelName strips a leading plate-loaded/brand prefix", () => {
    expect(
      cleanModelName("Plate Loaded Iso-Lateral Row", "Hammer Strength"),
    ).toBe("Iso-Lateral Row");
    expect(
      cleanModelName("Hammer Strength Iso-Lateral Row", "Hammer Strength"),
    ).toBe("Iso-Lateral Row");
  });

  test("mockExtractOne parses a real-shaped Product JSON-LD block", () => {
    const doc: RawDocument = {
      url: "https://example.com/reverse-v-squat",
      brandKey: "hammer-strength",
      fetchedAt: new Date().toISOString(),
      contentType: "text/html",
      extractionMethod: "jsonld-product",
      text: JSON.stringify({
        "@type": "Product",
        name: "Plate Loaded Reverse V-Squat",
        brand: { "@type": "Brand", name: "hammer strength" },
        description: "Two squat patterns. One plate loaded machine.",
      }),
    };
    const row = mockExtractOne(doc, "hammer-strength");
    expect(row).not.toBeNull();
    expect(row?.brand).toBe("hammer strength");
    expect(row?.model).toBe("Reverse V-Squat");
    expect(row?.category).toBe("squat-machine");
    expect(row?.mechanism).toBe("plate-loaded");
    expect(row?.muscleTargets).toBeNull();
    expect(row?.sourceUrl).toBe(doc.url);
  });

  test("mockExtractOne declines to guess on unstructured stripped-html", () => {
    const doc: RawDocument = {
      url: "https://example.com/category-landing",
      brandKey: "hammer-strength",
      fetchedAt: new Date().toISOString(),
      contentType: "text/html",
      extractionMethod: "stripped-html",
      text: "Browse our full range of plate loaded machines...",
    };
    expect(mockExtractOne(doc, "hammer-strength")).toBeNull();
  });

  test("toStagingMachine rejects a row missing brand/model", () => {
    expect(() =>
      toStagingMachine({ model: "X" }, "https://example.com"),
    ).toThrow();
    expect(() =>
      toStagingMachine({ brand: "X" }, "https://example.com"),
    ).toThrow();
  });

  test("toStagingMachine coerces an unknown category to 'other' rather than throwing", () => {
    const row = toStagingMachine(
      {
        brand: "Hammer Strength",
        model: "Mystery Machine",
        category: "not-a-real-category",
      },
      "https://example.com",
    );
    expect(row.category).toBe("other");
    expect(row.muscleTargets).toBeNull(); // never trusts a model's muscle-target guess
  });
});

describe("crawl-lib.ts", () => {
  test("decodeEntities handles the entities real product pages emit", () => {
    // Real Life Fitness product descriptions double-escape ("&amp;nbsp;"),
    // so decoding must fully resolve to a plain space, not stop at "&nbsp;".
    expect(decodeEntities("Plate&amp;nbsp;loaded &mdash; two patterns")).toBe(
      "Plate loaded — two patterns",
    );
  });

  test("extractJsonLdProduct finds a Product block among other JSON-LD types", () => {
    const html = `
      <script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
      <script type="application/ld+json">{"@type":"Product","name":"Reverse V-Squat","brand":{"name":"hammer strength"}}</script>
    `;
    const found = extractJsonLdProduct(html);
    expect(found).not.toBeNull();
    expect(JSON.parse(found as string).name).toBe("Reverse V-Squat");
  });

  test("extractJsonLdProduct returns null when no Product block exists", () => {
    expect(
      extractJsonLdProduct("<html><body>no ld+json here</body></html>"),
    ).toBeNull();
  });

  test("stripHtml drops tags/scripts/styles and collapses whitespace", () => {
    const html =
      "<html><head><style>.a{color:red}</style></head><body><script>evil()</script><h1>Title</h1>\n\n<p>Body   text</p></body></html>";
    expect(stripHtml(html)).toBe("Title Body text");
  });

  test("slugFor turns a URL path into a filesystem-safe slug", () => {
    expect(
      slugFor(
        "https://example.com/en-us/catalog/strength-training/plate-loaded/reverse-v-squat",
      ),
    ).toBe("en-us-catalog-strength-training-plate-loaded-reverse-v-squat");
  });
});

describe("migration-lib.ts", () => {
  test("idFor is deterministic and case-insensitive on (brand, model)", () => {
    expect(idFor("Hammer Strength", "Iso-Lateral Row")).toBe(
      idFor("hammer strength", "iso-lateral row"),
    );
    expect(idFor("Hammer Strength", "Iso-Lateral Row")).toMatch(
      /^00000000-0000-4000-9a00-[0-9a-f]{12}$/,
    );
  });

  test("rowSql escapes single quotes in string fields", () => {
    const sql = rowSql(machine({ model: "Ollie's Test O'Machine" }));
    expect(sql).toContain("Ollie''s Test O''Machine");
  });

  test("generateSql produces an idempotent insert with owner_id null", () => {
    const sql = generateSql("hammer-strength", [machine()]);
    expect(sql).toContain('insert into "machine_catalog"');
    expect(sql).toContain("on conflict (id) do nothing;");
    expect(sql).toMatch(
      /values\n\s+\('00000000-0000-4000-9a00-[0-9a-f]{12}',.*null,\s*'Hammer Strength'/s,
    );
  });

  test("generateSql throws on an id collision instead of silently dropping a row", () => {
    const dupe = [machine(), machine()]; // identical brand+model -> same derived id
    expect(() => generateSql("hammer-strength", dupe)).toThrow(/id collision/);
  });
});
