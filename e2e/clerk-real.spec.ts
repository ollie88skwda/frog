// Real Clerk (DEV instance) sign-in/sign-up against a LOCAL Convex backend.
// Not part of normal CI: needs a non-E2E build (no VITE_E2E) and Clerk test
// emails (`+clerk_test@example.com`, verification code 424242).
//   CLERK_REAL=1 CLERK_REAL_URL=http://localhost:4400 \
//   bun x playwright test -c e2e/playwright.clerk.config.ts
import { expect, test } from "@playwright/test";

test.skip(!process.env.CLERK_REAL, "Real-Clerk run only");
test.setTimeout(180_000);

const EMAIL = process.env.CLERK_TEST_EMAIL ?? "";

async function emailCode(page: import("@playwright/test").Page, email: string) {
  await page.getByLabel(/email address/i).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // Accounts created with a password land on the password step first; switch
  // to the email-code factor (test emails accept 424242).
  const other = page.getByRole("link", { name: "Use another method" });
  const onPassword = await other
    .waitFor({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (onPassword) {
    await other.click();
    await page.getByRole("button", { name: /email code/i }).click();
  }
  const code = page.getByLabel(/enter verification code/i);
  await code.waitFor({ timeout: 20_000 });
  await page.keyboard.type("424242", { delay: 80 });
}

test("real Clerk sign-in as a new user: empty home, library, session, settings", async ({
  page,
}) => {
  test.skip(!EMAIL, "CLERK_TEST_EMAIL not set");
  await page.goto("/auth");
  await emailCode(page, EMAIL);
  // New user lands on Home with the empty state.
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({
    timeout: 30_000,
  });
  // Convex accepted the Clerk `convex` JWT: data pages load without error.
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(
    page.getByText(/Can't reach the server|couldn’t load/i),
  ).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByTestId("start-session-btn")).toBeVisible();
  await page.goto("/history");
  await expect(
    page.getByText(/No sessions yet|The lab is empty/),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  // No horizontal overflow on any of these.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
