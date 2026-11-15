import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Redesign §7: old deep links keep working. Redirects and kept-routed screens
// as J6 shipped them (apps/web/src/app.tsx). /measures, /calendar, /trainer and
// the monthly/year recaps were deliberately kept on their old screens.

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

const REDIRECTS: [string, RegExp][] = [
  ["/train", /\/$/],
  ["/routines", /\/plan\?s=routines$/],
  ["/programs", /\/plan$/],
  ["/library", /\/plan\?s=library$/],
  ["/stats", /\/progress$/],
  ["/findings", /\/progress\?s=lab$/],
  ["/profile", /\/you$/],
  ["/settings", /\/you\?s=settings$/],
  ["/tips", /\/you\/rules$/],
];

for (const [from, to] of REDIRECTS)
  test(`${from} redirects`, async ({ page }) => {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  });

test("a redirect keeps the query string", async ({ page }) => {
  await page.goto("/library?new=1");
  await expect(page).toHaveURL(/\/plan\?.*s=library/);
  await expect(page).toHaveURL(/new=1/);
});

// Kept routed to their old screens (J6 decisions): they must still load.
const KEPT: [string, RegExp][] = [
  ["/measures", /\/measures$/],
  ["/calendar", /\/calendar$/],
  ["/trainer", /\/trainer$/],
  ["/stats/monthly", /\/stats\/monthly$/],
  ["/stats/year", /\/stats\/year$/],
  ["/history", /\/history$/],
  ["/changelog", /\/changelog$/],
];

for (const [path, url] of KEPT)
  test(`${path} still loads its own screen`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(url);
    await expect(
      page.locator("main, [role=main], #root").first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /not found|404/i }),
    ).toHaveCount(0);
  });

test("the four tabs are always labelled and navigate", async ({ page }) => {
  await page.goto("/");
  for (const [label, url] of [
    ["Plan", /\/plan/],
    ["Progress", /\/progress/],
    ["You", /\/you/],
    ["Today", /\/$/],
  ] as const) {
    await page
      .locator("nav.fixed")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page).toHaveURL(url);
  }
});

test("unknown routes show the 404, not a blank screen", async ({ page }) => {
  await page.goto("/nope-404");
  await expect(page.locator("body")).toContainText(
    /not found|404|not in the literature/i,
  );
});

test("Plan and You segments and You links work", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByTestId("plan-program-card")).toBeVisible();
  await page.goto("/you");
  await page.getByRole("link", { name: "How Frog decides" }).click();
  await expect(page).toHaveURL(/\/you\/rules$/);
  await page.goto("/you");
  await page.getByRole("link", { name: "Changelog" }).click();
  await expect(page).toHaveURL(/\/changelog$/);
});
