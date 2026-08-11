import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  pullUpLogger,
  signIn,
  waitForExercise,
} from "./helpers";

// Rest stopwatch (redesign R1): committing a set starts EXACTLY ONE up-counting
// stopwatch, and it is the logger drawer's peek bar — pinned to the screen
// edge, named after the set it follows ("resting · after <exercise> set N"),
// with no target and no countdown. Stopping it (Stop, pulling the drawer up,
// or the first keystroke of the next set) stamps the measured seconds onto the
// set that earned it. It is suppressed when the completed set is a drop set
// (drops chain into the next reduction with no rest) or a warm-up, and on
// duration/distance-type exercises where "resting between sets" isn't
// meaningful.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makeExercise(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
}

/** Same, but for a duration exercise. Radix Select shows option labels, not
 * values (and @frog/core isn't resolvable from e2e/), so pick by label. */
async function makeDurationExercise(page: Page, name: string) {
  await page.goto("/library");
  await page.getByTestId("new-exercise-btn").click();
  await page.getByTestId("exercise-name-input").fill(name);
  await page.getByTestId("exercise-type-select").click();
  await page.getByRole("option", { name: "Duration", exact: true }).click();
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, name);
}

async function elapsedSec(page: Page, name: string): Promise<number> {
  const txt = (await page.getByTestId(`rest-${name}-value`).innerText()).trim();
  const [m, s] = txt.split(":").map((n) => Number.parseInt(n, 10));
  return m * 60 + s;
}

test("stopwatch appears on commit and ticks up indefinitely", async ({
  page,
}) => {
  const EX = `Rest ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Complete a normal set → the dock appears with no target/preset step.
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();

  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  const start = await elapsedSec(page, EX);

  // Ticks up — no ceiling, no done-state to reach.
  await page.waitForTimeout(2200);
  const later = await elapsedSec(page, EX);
  expect(later).toBeGreaterThan(start);
  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
});

test("Stop ends the rest and stamps the measured seconds on the set it followed", async ({
  page,
}) => {
  const EX = `RestStop ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();

  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  // The set that is being rested after reads "rest …" while its clock runs.
  await expect(page.getByTestId("committed-0-rest")).toHaveText("rest …");

  await page.waitForTimeout(2200);
  await page.getByTestId(`rest-${EX}-stop`).click();
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();

  // …and the measurement lands on THAT set (rest-after), not on the next one.
  await expect(page.getByTestId("committed-0-rest")).toHaveText(
    /^rest \d+:\d{2}$/,
  );
  await expect
    .poll(() =>
      page.evaluate(async (n) => {
        const { data } = await window.__frog.supabase
          .from("exercises")
          .select("id")
          .eq("name", n)
          .single();
        const { data: rows } = await window.__frog.supabase
          .from("set_logs")
          .select("rest_sec, session_exercises!inner(exercise_id)")
          .eq("session_exercises.exercise_id", data?.id ?? "");
        return (rows ?? []).map((r) => r.rest_sec as number | null);
      }, EX),
    )
    .toEqual([expect.any(Number)]);
});

test("the first keystroke of the next set also ends the rest", async ({
  page,
}) => {
  const EX = `RestType ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();

  await page.waitForTimeout(1200);
  await pullUpLogger(page);
  await page.getByTestId("set-1-weight").fill("1");

  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
  await expect(page.getByTestId("committed-0-rest")).toHaveText(
    /^rest \d+:\d{2}$/,
  );
});

test("suppressed when the completed set is a drop set", async ({ page }) => {
  const EX = `RestDrop ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Mark the set as a Drop set in the logger, then complete it.
  await pullUpLogger(page);
  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-drop").click();
  await page.getByTestId("set-0-weight").fill("60");
  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-add").click();

  // The set logged (marker D) but no stopwatch started.
  await expect(page.getByTestId("committed-0-type")).toHaveText("D");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});

test("suppressed when the completed set is a warm-up", async ({ page }) => {
  const EX = `RestWarmup ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Mark the set as a Warm-up in the logger, then complete it.
  await pullUpLogger(page);
  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-warmup").click();
  await page.getByTestId("set-0-weight").fill("40");
  await page.getByTestId("set-0-reps").fill("10");
  await page.getByTestId("set-0-add").click();

  // The set logged (marker W) but no stopwatch started.
  await expect(page.getByTestId("committed-0-type")).toHaveText("W");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();

  // The working set that follows still starts it.
  await pullUpLogger(page);
  await page.getByTestId("set-1-weight").fill("100");
  await page.getByTestId("set-1-reps").fill("5");
  await page.getByTestId("set-1-add").click();
  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
});

test("suppressed on a duration exercise, which hides the badge too", async ({
  page,
}) => {
  const EX = `RestPlank ${Date.now()}`;
  await makeDurationExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await pullUpLogger(page);
  await page.getByTestId("set-0-duration").fill("1:30");
  await page.getByTestId("set-0-add").click();

  // The set logged but no stopwatch started.
  await expect(page.getByTestId("committed-0-duration")).toHaveText("1:30");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});
