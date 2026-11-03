import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(n) && !n.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("brand guard (Because green)", () => {
  const files = walk(join(__dirname));
  const read = (f: string) => readFileSync(f, "utf8");
  it("has no lucide-react imports", () => {
    expect(files.filter((f) => read(f).includes("lucide-react"))).toEqual([]);
  });
  it("does not use the old Radix grass/sage look or radius none", () => {
    const bad = files.filter((f) =>
      /accentColor="grass"|grayColor="sage"|radius="none"/.test(read(f)),
    );
    expect(bad).toEqual([]);
  });
  it("uses no pill/oversize rounding off the corner scale", () => {
    const bad = files.filter(
      (f) => f.endsWith(".tsx") && /rounded-(xl|2xl|3xl)\b/.test(read(f)),
    );
    expect(bad).toEqual([]);
  });
});
