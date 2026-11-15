import type { Page } from "@playwright/test";

// Rendered-DOM brand audit against docs/brand/because-reference/BRAND-FINAL-SPEC.md: Geologica
// only, Base 8 corners (4/8/12/16/24, or full for pills/circles), no lines
// except the 1px border on text fields (inputs, textareas, selects), Because green theme on <html>, and
// no lucide icons (lucide-react stamps `class="lucide"` on every svg it
// renders).
export type BrandAudit = {
  theme: string | undefined;
  mode: string | undefined;
  overflowX: boolean;
  lucideIcons: number;
  fonts: string[];
  badRadii: string[];
  lines: string[];
};

export const BASE8_RADII = [0, 4, 8, 12, 16, 24];

export function auditBrand(page: Page): Promise<BrandAudit> {
  return page.evaluate((scale) => {
    const de = document.documentElement;
    const fonts = new Set<string>();
    const badRadii = new Set<string>();
    const lines = new Set<string>();
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const tag = el.tagName.toLowerCase();
      if (
        tag === "svg" ||
        el.closest("svg") ||
        el.closest('[data-testid^="annotate-"]')
      )
        continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const cs = getComputedStyle(el);
      const id = `${tag}.${String(el.className).slice(0, 50)}`;
      for (const k of [
        "borderTopLeftRadius",
        "borderTopRightRadius",
        "borderBottomLeftRadius",
        "borderBottomRightRadius",
      ] as const) {
        const v = parseFloat(cs[k]);
        const full = v >= Math.min(rect.width, rect.height) / 2 - 1;
        if (v > 0 && !scale.includes(v) && !full) badRadii.add(`${v}px ${id}`);
      }
      if (
        !["input", "textarea", "select"].includes(tag) &&
        el.getAttribute("role") !== "combobox"
      )
        for (const s of ["Top", "Right", "Bottom", "Left"] as const)
          if (
            parseFloat(cs[`border${s}Width`]) > 0 &&
            cs[`border${s}Style`] !== "none"
          )
            lines.add(id);
      if (
        Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && n.textContent?.trim(),
        )
      )
        fonts.add(cs.fontFamily.split(",")[0].replace(/"/g, "").trim());
    }
    return {
      theme: de.dataset.theme,
      mode: de.dataset.mode,
      overflowX: de.scrollWidth > de.clientWidth + 1,
      lucideIcons: document.querySelectorAll("svg.lucide").length,
      fonts: [...fonts],
      badRadii: [...badRadii].slice(0, 8),
      lines: [...lines].slice(0, 8),
    };
  }, BASE8_RADII);
}
