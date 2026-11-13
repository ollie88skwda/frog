import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Regression for the reported "starting a workout throws a type error".
// An unreachable backend makes the sessions:start call reject at the
// transport layer; the Convex transport re-emits that as "TypeError: Failed to
// fetch" (Chromium) / "TypeError: Load failed" (WebKit), and Train's start
// card used to print it straight to the user. docs/DECISIONS.md 2026-08-25.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("an unreachable server shows plain language, never a raw TypeError", async ({
  page,
}) => {
  await page.route("**/api/mutation?fn=sessions:start*", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );

  await page.goto("/");
  await page.getByTestId("start-session-btn").click();

  const card = page.locator("main");
  await expect(card).toContainText("check your connection", {
    timeout: 10_000,
  });
  // The whole point: the exception's constructor name never reaches the user.
  await expect(page.locator("body")).not.toContainText("TypeError");
  await expect(page.locator("body")).not.toContainText("Failed to fetch");
  // A failed start must not navigate — there is no session to go to.
  await expect(page).toHaveURL(/\/$/);
});

test("a real server error still reaches the user verbatim", async ({
  page,
}) => {
  await page.route("**/api/mutation?fn=sessions:start*", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          // Convex reports a function-level failure as HTTP 200 + an error
          // envelope; a ConvexError's string `errorData` is the message.
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "error",
            errorMessage: "Server Error\nUncaught ConvexError: Not signed in",
            errorData: "permission denied for table sessions",
          }),
        })
      : route.continue(),
  );

  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page.locator("body")).toContainText(
    "permission denied for table sessions",
    { timeout: 10_000 },
  );
});
