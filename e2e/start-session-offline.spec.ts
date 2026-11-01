import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Regression for the reported "starting a workout throws a type error".
// A Supabase project that is paused, restoring or otherwise unreachable makes
// the sessions insert reject at the transport layer; postgrest-js re-emits that
// as "TypeError: Failed to fetch" (Chromium) / "TypeError: Load failed"
// (WebKit), Repo.startSession rethrows the message verbatim, and Train's start
// card used to print it straight to the user. docs/DECISIONS.md 2026-08-25.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("an unreachable server shows plain language, never a raw TypeError", async ({
  page,
}) => {
  await page.route("**/rest/v1/sessions**", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();

  const card = page.getByTestId("start-session-btn").locator("xpath=../..");
  await expect(card).toContainText("check your connection", {
    timeout: 10_000,
  });
  // The whole point: the exception's constructor name never reaches the user.
  await expect(page.locator("body")).not.toContainText("TypeError");
  await expect(page.locator("body")).not.toContainText("Failed to fetch");
  // A failed start must not navigate — there is no session to go to.
  await expect(page).toHaveURL(/\/train$/);
});

test("a real PostgREST error still reaches the user verbatim", async ({
  page,
}) => {
  await page.route("**/rest/v1/sessions**", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "42501",
            message: "permission denied for table sessions",
          }),
        })
      : route.continue(),
  );

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page.locator("body")).toContainText(
    "permission denied for table sessions",
    { timeout: 10_000 },
  );
});
