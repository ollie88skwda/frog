import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Import (frog-import-core): pasted text and a CSV both land in the shared
// review screen; nothing is written until Import is tapped; History then shows
// the sessions; importing the same file again is skipped as a duplicate.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function sessionCount(
  page: import("@playwright/test").Page,
  title: string,
) {
  return page.evaluate(async (t) => {
    const { count } = await window.__frog.db
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("title", t);
    return count ?? 0;
  }, title);
}

test("paste text → review → confirm → History", async ({ page }) => {
  const stamp = Date.now();
  const title = `Pasted Push ${stamp}`;
  const exName = `Zottman Curl ${stamp}`;
  await page.goto("/import");
  await page
    .getByTestId("import-text")
    .fill(
      `${title}\nThursday, 12 Mar 2015 at 5:30 PM\n${exName}\n1  40 lb x 10\n2  45 lb x 8 @ RPE 9\n`,
    );
  await page.getByTestId("import-read-text").click();

  await expect(page.getByTestId("import-review")).toBeVisible();
  await expect(page.getByTestId("review-counts")).toContainText("1 sessions");
  await expect(page.getByTestId("review-counts")).toContainText("2 sets");
  // lb detected from the text; unmatched name becomes a new exercise.
  await expect(page.getByTestId("review-unit-read")).toContainText("lbs");
  await expect(page.getByText("New exercise").first()).toBeVisible();
  // Nothing written yet.
  expect(await sessionCount(page, title)).toBe(0);

  await page.getByTestId("review-confirm").click();
  await expect(page.getByTestId("import-done")).toBeVisible();
  expect(await sessionCount(page, title)).toBe(1);

  // Weight stored in kg.
  const kg = await page.evaluate(async (n) => {
    const sb = window.__frog.db;
    const { data: ex } = await sb.from("exercises").select("id").eq("name", n);
    const { data: se } = await sb
      .from("session_exercises")
      .select("id")
      .eq("exercise_id", ex?.[0]?.id);
    const { data: sets } = await sb
      .from("set_logs")
      .select("weight_kg,rir")
      .eq("session_exercise_id", se?.[0]?.id);
    return (sets ?? []).map((s) => [
      Math.round((s.weight_kg ?? 0) * 100) / 100,
      s.rir,
    ]);
  }, exName);
  expect(kg).toEqual([
    [18.14, null],
    [20.41, 1],
  ]);

  await page.getByTestId("import-view-history").click();
  await expect(
    page.locator('[data-testid^="history-row-"]').first(),
  ).toBeVisible();
  for (let i = 0; i < 20; i++) {
    if (await page.getByText(title).isVisible()) break;
    const more = page.getByRole("button", { name: /load more/i });
    if (!(await more.isVisible())) break;
    await more.click();
    await page.waitForTimeout(400);
  }
  await expect(page.getByText(title)).toBeVisible();

  // Re-import of the same text: flagged as a duplicate, off by default, so the
  // confirm button has nothing to import.
  await page.goto("/import");
  await page
    .getByTestId("import-text")
    .fill(
      `${title}\nThursday, 12 Mar 2015 at 5:30 PM\n${exName}\n1  40 lb x 10\n2  45 lb x 8 @ RPE 9\n`,
    );
  await page.getByTestId("import-read-text").click();
  await expect(page.getByTestId("review-dupe")).toBeVisible();
  await expect(page.getByTestId("review-confirm")).toBeDisabled();
});

test("CSV (Strong) → review → low-confidence highlight → confirm", async ({
  page,
}) => {
  const stamp = Date.now();
  const title = `CSV Pull ${stamp}`;
  const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Weight Unit,Reps,RPE,Distance,Distance Unit,Seconds,Notes,Workout Notes
2014-02-03 09:00:00,${title},45m,Deadlift ${stamp},1,100,kg,5,8,,,,,
2014-02-03 09:00:00,${title},45m,Deadlift ${stamp},2,100,kg,5,9,,,,,
`;
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles({
    name: "strong.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByTestId("import-review")).toBeVisible();
  await expect(page.getByTestId("review-counts")).toContainText("2 sets");
  expect(await sessionCount(page, title)).toBe(0);
  await page.getByTestId("review-confirm").click();
  await expect(page.getByTestId("import-done")).toBeVisible();
  expect(await sessionCount(page, title)).toBe(1);
});

test("text with a missing unit and date is flagged and blocks confirm until dated", async ({
  page,
}) => {
  await page.goto("/import");
  await page.getByTestId("import-text").fill("Mystery Press\n1  50 x 10\n");
  await page.getByTestId("import-read-text").click();
  await expect(
    page.locator('[data-testid="review-session"][data-low="1"]'),
  ).toBeVisible();
  await expect(page.getByText("No date found")).toBeVisible();
  await expect(page.getByTestId("review-confirm")).toBeDisabled();
  await page.getByTestId("review-date").fill("2013-01-05T10:00");
  await expect(page.getByTestId("review-confirm")).toBeEnabled();
});
