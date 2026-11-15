import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// Cross-job happy path (redesign §8.1, §8.2, §8.6): Today -> start a routine ->
// the prescription-aware workout screen (target line, Top set, planned-RIR hint,
// range chip, live strip) -> finish -> the vs-plan report -> History. Phone
// viewport, per AGENTS.md.

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
  // Today's hero depends on whether a session is live; the suite shares one user.
  await page.evaluate(async () => {
    const now = Date.now();
    const { error } = await window.__frog.db
      .from("sessions")
      .update({ deleted_at: now, updated_at: now })
      .is("deleted_at", null)
      .is("ended_at", null);
    if (error) throw new Error(error.message);
  });
});

test("Today -> routine -> log sets -> finish -> vs-plan report -> history", async ({
  page,
}) => {
  const stamp = Date.now();
  const EX = `Flow Press ${stamp}`;
  const ROUTINE = `Flow Push ${stamp}`;

  // A compound with a primary muscle, so Top set + live strip apply.
  await page.goto("/library");
  await page.getByTestId("new-exercise-btn").click();
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("exercise-editor-add-primary-muscles").click();
  await page.getByRole("option", { name: "Pecs", exact: true }).click();
  await page.getByTestId("exercise-editor-mechanic-compound").click();
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, EX);

  // Routine: top set 100 x 4-6, two back-offs 85 x 8-10 @ 2-3.
  await page.goto("/plan?s=routines");
  await page.getByTestId("new-routine-btn").click();
  await page.getByTestId("routine-name-input").fill(ROUTINE);
  await page.getByTestId("routine-add-exercise-btn").click();
  await page.getByTestId(`routine-pick-${EX}`).click();
  await page.getByTestId("routine-ex-0-set-0-weight").fill("100");
  await page.getByTestId("routine-ex-0-set-0-reps").fill("4");
  await page.getByTestId("routine-ex-0-set-0-repsmax").fill("6");
  for (const s of [1, 2]) {
    await page.getByTestId(`routine-ex-0-set-${s}-weight`).fill("85");
    await page.getByTestId(`routine-ex-0-set-${s}-reps`).fill("8");
    await page.getByTestId(`routine-ex-0-set-${s}-repsmax`).fill("10");
    await page.getByTestId(`routine-ex-0-set-${s}-rirmin`).fill("2");
    await page.getByTestId(`routine-ex-0-set-${s}-rirmax`).fill("3");
  }
  await page.getByTestId("routine-save-btn").click();
  await expect(page).toHaveURL(/\/plan\?s=routines$/);

  // Today names the routine, then starts it.
  await page.goto("/");
  await expect(page.getByTestId("home-hero")).toBeVisible();
  await page.getByTestId(`hero-pick-${ROUTINE}`).click();
  await expect(page.getByTestId("hero-plan-name")).toHaveText(ROUTINE);
  await page.getByTestId("home-start-btn").click();
  await expect(page).toHaveURL(/\/session\//);

  // The tab bar hides inside the workout (takeover).
  await expect(page.locator("nav.fixed")).toBeHidden();

  // Prescription: target line, Top set label, planned RIR shown as a non-saved
  // hint (nothing pressed until tapped).
  const target = page.getByTestId("target-line");
  await expect(target).toContainText("Today");
  await expect(target).toContainText("4-6");
  await expect(target).toContainText("RIR");
  await expect(page.getByTestId("top-set-label")).toHaveText(/top set/i);
  await expect(page.getByTestId("rir-option-2")).toHaveAttribute(
    "data-hint",
    "true",
  );
  await expect(
    page.locator('[data-testid^="rir-option-"][aria-pressed="true"]'),
  ).toHaveCount(0);
  // One tap accepts the hint.
  await page.getByTestId("rir-option-2").click();
  await expect(page.getByTestId("rir-option-2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Top set 100 x 6 -> top of range, with a Brzycki e1RM line, live strip.
  await page.getByTestId("weight-field").fill("100");
  await page.getByTestId("reps-field").fill("6");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("range-chip")).toHaveText("top of range");
  await expect(page.getByTestId("set-result")).toContainText("e1RM");
  await expect(page.getByTestId("live-strip")).toContainText("1 hard set");

  // Over 10 total reps: a plain line, never an invented estimate.
  await page.getByTestId("weight-field").fill("60");
  await page.getByTestId("reps-field").fill("12");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("set-result")).toContainText(
    "Over 10 reps in total",
  );

  // Finish -> vs-plan report -> history.
  await page.getByTestId("session-finish").click();
  await expect(page.getByTestId("finish-save")).toBeEnabled();
  await page.getByTestId("finish-save").click();
  await expect(page).toHaveURL(/\/history\//);
  await expect(page.getByTestId("post-save-summary")).toBeVisible();
  await page.getByTestId("summary-dots").getByRole("button").last().click();
  await expect(page.getByTestId("summary-report")).toHaveText("vs plan");
  await expect(page.getByTestId("summary-range-state").first()).toBeVisible();
  await page.getByTestId("summary-dismiss").click();

  // History lists it; Today now shows it as the last session.
  await page.goto("/history");
  await expect(
    page.locator('[data-testid^="history-row-"]').first(),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("today-last-session")).toBeVisible();
});

test("Start empty workout is always one tap away and Today then offers to resume it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  // Resume surfaces on Today while a session is live.
  await page.goto("/");
  await expect(page.getByTestId("hero-resume-btn")).toBeVisible();
});
