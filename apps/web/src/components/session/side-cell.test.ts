// Item 8 (docs/ux-audit/2026-11-25/fix-6-8): a per-side cell must read as its
// own cell. Its 1px outline (--color-border-field) and its solid L/R tag
// (--color-text-secondary fill) must each clear WCAG non-text contrast (3:1)
// on every row fill the cell sits on, and the tag letter must clear 4.5:1 on
// the tag. Checked against the real tokens so a theme edit can't quietly
// fade the split again.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../../styles/theme.css", import.meta.url)),
  "utf8",
);

function vars(mode: "day" | "night") {
  const m = css.match(
    new RegExp(
      `\\[data-theme="green"\\]\\[data-mode="${mode}"\\]\\s*\\{([^}]*)\\}`,
    ),
  );
  if (!m) throw new Error(`no ${mode} block`);
  return Object.fromEntries(
    [...m[1].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((x) => [
      x[1],
      x[2],
    ]),
  );
}

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe.each(["day", "night"] as const)("%s side cell", (mode) => {
  const t = vars(mode);
  // Set-list row (surface, its hover, the selected accent-soft) and the
  // logged-sets summary tile (surface-2 = bg-subtle).
  const fills = {
    row: t["--color-bg-surface"],
    rowHover: t["--color-bg-hover"],
    rowSelected: t["--color-accent-bg-subtle"],
    summaryTile: t["--color-bg-subtle"],
  };
  for (const [name, fill] of Object.entries(fills)) {
    it(`outline is >= 3:1 on ${name}`, () => {
      expect(ratio(t["--color-border-field"], fill)).toBeGreaterThanOrEqual(3);
    });
    it(`tag fill is >= 3:1 on ${name}`, () => {
      expect(ratio(t["--color-text-secondary"], fill)).toBeGreaterThanOrEqual(
        3,
      );
    });
  }
  it("tag letter is >= 4.5:1 on the tag", () => {
    expect(
      ratio(t["--color-bg-page"], t["--color-text-secondary"]),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
