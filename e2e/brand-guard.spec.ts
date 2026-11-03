import { expect, test } from "@playwright/test";
import { auditBrand } from "./brand-audit";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Brand guard: rendered routes carry the Because green brand
// (docs/brand/because-reference/BRAND-FINAL-SPEC.md), and a saved pre-rebrand
// light/dark choice survives as Day/Night.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

for (const path of ["/", "/train", "/library", "/stats", "/settings"])
  test(`brand guard ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const a = await auditBrand(page);
    expect(a.theme).toBe("green");
    expect(["day", "night"]).toContain(a.mode);
    expect(a.lucideIcons).toBe(0);
    expect(a.fonts.filter((f) => f !== "Geologica")).toEqual([]);
    expect(a.badRadii).toEqual([]);
    expect(a.lines).toEqual([]);
  });

for (const [legacy, mode] of [
  ["light", "day"],
  ["dark", "night"],
] as const)
  test(`legacy theme "${legacy}" opens in ${mode}`, async ({ page }) => {
    await page.emulateMedia({
      colorScheme: legacy === "light" ? "dark" : "light",
    });
    await page.evaluate((v) => {
      localStorage.removeItem("mode");
      localStorage.setItem("theme", v);
    }, legacy);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
    expect(
      await page.evaluate(() => [
        localStorage.getItem("mode"),
        localStorage.getItem("theme"),
      ]),
    ).toEqual([mode, null]);
  });
