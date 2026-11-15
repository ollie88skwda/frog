import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Every screen is a lazy() route and the host (wrangler.jsonc + worker/index.ts) keeps /assets/ out of
// the SPA fallback, so a hashed chunk from a superseded deploy is a real 404: a tab or
// installed PWA left open across a release could not open a new screen and
// React unmounted the app to a blank page. app.tsx retries once then reloads
// once per tab; <AppErrorBoundary> catches whatever survives that.
// docs/DECISIONS.md 2026-08-25.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a chunk that no longer exists shows the reload card, not a blank screen", async ({
  page,
}) => {
  await page.route("**/assets/session-*.js", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "Not Found",
    }),
  );

  await page.goto("/");
  await page.getByTestId("start-session-btn").click();

  // Retry, then one guarded reload, then the card — never an empty <body>.
  const card = page.getByTestId("app-error-card");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Frog updated");
  await expect(page.getByTestId("app-error-reload")).toBeVisible();
});

test("the guarded reload happens at most once per tab", async ({ page }) => {
  let sessionChunkRequests = 0;
  await page.route("**/assets/session-*.js", (route) => {
    sessionChunkRequests++;
    return route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "Not Found",
    });
  });

  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page.getByTestId("app-error-card")).toBeVisible({
    timeout: 20_000,
  });

  // Two attempts before the reload, two after it, and then the card — if the
  // guard leaked, the tab would reload forever and this would keep climbing.
  const settled = sessionChunkRequests;
  await page.waitForTimeout(3000);
  expect(sessionChunkRequests).toBe(settled);
  await expect(page.getByTestId("app-error-card")).toBeVisible();
});
