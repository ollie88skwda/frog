import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  rowCount,
  signIn,
  waitForExercise,
} from "./helpers";

// The web app's QueryClient retries every mutation up to 3x (apps/web/src/app.tsx).
// If the FIRST attempt's write actually lands server-side but its response is
// lost (a real possibility on a flaky connection), the retry must not create
// a second row — logSet has to be idempotent against its own retries.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a retried log-set write after a lost response does not duplicate the set", async ({
  page,
}) => {
  const EX = `Retry ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");

  // Let the first POST to set_logs actually complete against the real
  // server (so the row is genuinely created), then hand the page a failed
  // response anyway — simulating a dropped response, not a dropped request.
  // The retry must be let through untouched.
  let posts = 0;
  await page.route("**/rest/v1/set_logs*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    posts += 1;
    if (posts === 1) {
      await route.fetch();
      await route.fulfill({ status: 500, body: "simulated dropped response" });
    } else {
      await route.continue();
    }
  });

  await page.getByTestId("weight-field").fill("100");
  await page.getByTestId("reps-field").fill("5");
  await page.getByTestId("log-set").click();

  // The retry lands asynchronously (exponential backoff) — poll for it.
  await expect.poll(() => posts, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);

  await page.unroute("**/rest/v1/set_logs*");

  // Reload: local optimistic state only ever added one row, so a real
  // duplicate would only surface once the page re-fetches from the server —
  // asserted server-side (row count, not UI) since a duplicate would still
  // only ever render as a single set-mark-0 regardless.
  await page.reload();
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
  expect(await rowCount(page, "set_logs")).toBe(before + 1);
});
