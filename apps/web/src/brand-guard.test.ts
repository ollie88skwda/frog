import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

// Brand guard: compile styles/theme.css with the real Tailwind compiler, emit
// the utilities screens use, and resolve each one's value through the custom
// property cascade for a given data-mode. Expected values come from
// docs/brand/because-reference/BRAND-FINAL-SPEC.md and CORNERS-SPEC.md, not
// from theme.css. The lucide ban is enforced on the built bundle
// (scripts/check-bundle.ts) and rendered DOM (e2e/brand-guard.spec.ts).

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const UTILITIES = [
  "rounded-xs",
  "rounded-sm",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "font-sans",
  "bg-accent",
  "bg-action",
  "bg-bg",
  "text-ink",
];

type Scope = Map<string, string>;
let css = "";

beforeAll(async () => {
  const stylesDir = resolve(here, "styles");
  const compiler = await compile(
    readFileSync(resolve(stylesDir, "theme.css"), "utf8"),
    {
      base: stylesDir,
      loadStylesheet: async (id, base) => {
        const path =
          id === "tailwindcss"
            ? require.resolve("tailwindcss/index.css")
            : resolve(base, id);
        return {
          path,
          base: dirname(path),
          content: readFileSync(path, "utf8"),
        };
      },
    },
  );
  css = compiler.build(UTILITIES);
});

function rules(): { selector: string; decls: Scope }[] {
  const out: { selector: string; decls: Scope }[] = [];
  for (const [, selector, body] of css.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const decls: Scope = new Map();
    for (const d of body.split(";")) {
      const i = d.indexOf(":");
      if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    out.push({ selector: selector.trim(), decls });
  }
  return out;
}

function matches(selector: string, mode: "day" | "night"): boolean {
  return selector.split(",").some((s) => {
    const sel = s.trim();
    if (sel === ":root" || sel === ":host") return true;
    const attrs = [...sel.matchAll(/\[data-(theme|mode)="([^"]+)"\]/g)];
    return (
      attrs.length > 0 &&
      sel.replace(/\[data-(theme|mode)="[^"]+"\]/g, "") === "" &&
      attrs.every(([, k, v]) => (k === "theme" ? v === "green" : v === mode))
    );
  });
}

function computed(
  utility: string,
  property: string,
  mode: "day" | "night",
): string {
  const all = rules();
  const vars: Scope = new Map();
  for (const r of all)
    if (matches(r.selector, mode))
      for (const [k, v] of r.decls) if (k.startsWith("--")) vars.set(k, v);
  const rule = all.find((r) => r.selector === `.${utility}`);
  const raw = rule?.decls.get(property);
  if (raw === undefined) throw new Error(`.${utility} sets no ${property}`);
  let value = raw;
  for (let i = 0; i < 20 && value.includes("var("); i++)
    value = value.replace(
      /var\((--[\w-]+)(?:,\s*([^)]*))?\)/g,
      (_, name: string, fallback?: string) => vars.get(name) ?? fallback ?? "",
    );
  return value.trim().toLowerCase();
}

describe("brand guard: compiled Because green tokens", () => {
  it("corner utilities sit on the Base 8 scale (4/8/12/16/24)", () => {
    const radii = ["xs", "sm", "md", "lg", "xl"].map((s) =>
      computed(`rounded-${s}`, "border-radius", "day"),
    );
    expect(radii).toEqual(["4px", "8px", "12px", "16px", "24px"]);
  });

  it("the sans stack leads with Geologica", () => {
    expect(computed("font-sans", "font-family", "day")).toMatch(
      /^"?geologica"?,/,
    );
  });

  it.each([
    ["day", "#afcfab", "#251d1a", "#fcf9f4", "#211816"],
    ["night", "#99c195", "#e2ddd5", "#191513", "#ece7df"],
  ] as const)("%s mode: Fern accent, ink primary, paper/graphite ground", (mode, accent, action, page, ink) => {
    expect(computed("bg-accent", "background-color", mode)).toBe(accent);
    expect(computed("bg-action", "background-color", mode)).toBe(action);
    expect(computed("bg-bg", "background-color", mode)).toBe(page);
    expect(computed("text-ink", "color", mode)).toBe(ink);
  });
});
