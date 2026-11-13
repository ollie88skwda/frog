// F12: contrast pairs checked against the real tokens in theme.css so a token
// edit that breaks a data-mark or attention pair fails CI.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../../styles/theme.css", import.meta.url)),
  "utf8",
);

function block(mode: "day" | "night") {
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
function ratio(a: string, b: string) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(["day", "night"] as const)("%s contrast", (mode) => {
  const t = block(mode);
  const surface = t["--color-bg-surface"];
  it("--chart-mark is >= 3:1 on surface (data mark)", () => {
    expect(ratio(t["--chart-mark"], surface)).toBeGreaterThanOrEqual(3);
  });
  it("amber attention text is >= 4.5:1 on its soft fill and on surface", () => {
    expect(
      ratio(t["--color-attn-text"], t["--color-attn-bg-subtle"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t["--color-attn-text"], surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("secondary text is >= 4.5:1 on hover tone (badge/chip fills)", () => {
    expect(
      ratio(t["--color-text-secondary"], t["--color-bg-hover"]),
    ).toBeGreaterThanOrEqual(4.5);
  });
  it("accent text is >= 4.5:1 on accent-soft (T2 tier badge)", () => {
    expect(
      ratio(t["--color-accent-text"], t["--color-accent-bg-subtle"]),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

it("Fern 8/9 are never data marks: day Fern 9 fails 3:1 on surface", () => {
  expect(ratio("#afcfab", "#fffefb")).toBeLessThan(3);
  expect(ratio("#79a274", "#fffefb")).toBeLessThan(3.5);
});
