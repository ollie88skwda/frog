import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Rest stopwatch (session redesign R2, requirement 1): committing a set starts
// exactly ONE up-counting clock, mounted directly under the committed row it
// measures and naming that set. It never counts down, has no target and no
// done state. It stops on the first keystroke of the next set or on Stop —
// and stopping STAMPS the measured seconds onto the set it followed.
//
// It stays scoped to normal working sets on rep/weight exercises: suppressed
// when the completed set is a drop set (drops chain into the next reduction
// with no rest) or a warm-up, and on duration/distance types (plank, running)
// where "resting between sets" isn't meaningful.

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

async function logSet(page: Page, index: number, weight: string, reps: string) {
  await page.getByTestId(`set-${index}-weight`).fill(weight);
  await page.getByTestId(`set-${index}-reps`).fill(reps);
  await page.getByTestId(`set-${index}-done`).click();
}

test("one stopwatch, under its own set, counting up indefinitely", async ({
  page,
}) => {
  const EX = `Rest ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await logSet(page, 0, "100", "5");

  const chip = page.getByTestId(`rest-${EX}`);
  await expect(chip).toBeVisible();
  // It names the set it follows and what will stop it.
  await expect(chip).toContainText("after set 1");
  await expect(chip).toContainText("stops when you start set 2");
  // Exactly one clock on the whole screen.
  await expect(page.getByTestId(`rest-${EX}-value`)).toHaveCount(1);

  const start = await elapsedSec(page, EX);
  await page.waitForTimeout(2200);
  const later = await elapsedSec(page, EX);
  expect(later).toBeGreaterThan(start);
  await expect(chip).toBeVisible();
});

test("the first keystroke of the next set stops the clock and stamps the set it followed", async ({
  page,
}) => {
  const EX = `RestStamp ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await logSet(page, 0, "100", "5");
  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  // Nothing is stamped while the clock is still running.
  await expect(page.getByTestId("committed-0-rest")).toHaveText("");

  await page.waitForTimeout(2200);
  await page.getByTestId("set-1-weight").pressSequentially("1");

  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
  await expect(page.getByTestId("committed-0-rest")).not.toHaveText("");

  // The stamp is the rest that FOLLOWED set 1, and it persists.
  await expect
    .poll(() =>
      page.evaluate(async (n) => {
        const { data: ex } = await window.__frog.supabase
          .from("exercises")
          .select("id")
          .eq("name", n)
          .single();
        const { data: se } = await window.__frog.supabase
          .from("session_exercises")
          .select("id")
          .eq("exercise_id", ex?.id ?? "");
        const { data: sets } = await window.__frog.supabase
          .from("set_logs")
          .select("set_no,rest_sec")
          .in(
            "session_exercise_id",
            (se ?? []).map((s) => s.id),
          );
        return (sets ?? []).find((s) => s.set_no === 0)?.rest_sec ?? null;
      }, EX),
    )
    .toBeGreaterThan(0);
});

test("Stop also stops the clock and stamps its set", async ({ page }) => {
  const EX = `RestStop ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await logSet(page, 0, "100", "5");

  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByTestId(`rest-${EX}-stop`).click();
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
  await expect(page.getByTestId("committed-0-rest")).not.toHaveText("");
});

test("suppressed when the completed set is a drop set", async ({ page }) => {
  const EX = `RestDrop ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Mark the set as a Drop set, then log it.
  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-drop").click();
  await logSet(page, 0, "60", "8");

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

  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-warmup").click();
  await logSet(page, 0, "40", "10");

  // The set logged (marker W) but no stopwatch started.
  await expect(page.getByTestId("committed-0-type")).toHaveText("W");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();

  // The working set that follows still starts it.
  await logSet(page, 1, "100", "5");
  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  await expect(page.getByTestId(`rest-${EX}`)).toContainText("after set 2");
});

test("suppressed on a duration exercise", async ({ page }) => {
  const EX = `RestPlank ${Date.now()}`;
  await makeDurationExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await page.getByTestId("set-0-duration").fill("1:30");
  await page.getByTestId("set-0-done").click();

  // The set logged but no stopwatch started.
  await expect(page.getByTestId("committed-0-duration")).toHaveText("1:30");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});

test("no rest readout survives outside the station card", async ({ page }) => {
  // R1 is one clock per rest period: the floating RestDock, the unlabeled
  // subheader timer and the block-header rest icon are all gone. If any of
  // them comes back, this fails.
  const EX = `RestSolo ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await logSet(page, 0, "100", "5");

  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  await expect(page.getByTestId(`block-${EX}-rest-timer`)).toHaveCount(0);
  // The chip lives inside the station card, not floating over the viewport.
  const inCard = await page
    .getByTestId(`rest-${EX}`)
    .evaluate((el) => el.closest("[data-testid^='block-']") != null);
  expect(inCard).toBe(true);
});
