import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  rowCount,
  signIn,
  waitForExercise,
} from "./helpers";

// Auto-checkoff: once both weight AND reps carry a value, leaving the row
// commits the set (no separate checkmark tap needed) — the phantom-commit
// guard now only protects an INCOMPLETE row (weight typed, reps still
// empty) from silently committing on blur.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("filling only weight then tapping away does not commit a set", async ({
  page,
}) => {
  const EX = `Phantom ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");

  // Tap away from the row entirely — not Enter, not the checkmark, not
  // "Add set" — just focus leaving the row, e.g. tapping the page header.
  await page.getByRole("heading", { level: 1 }).click();

  // Reps was never filled, so the draft must still be sitting at index 0 —
  // if it phantom-committed, this row would have remounted as index 1 with
  // fresh empty state, and this assertion times out (bug repro).
  await expect(page.getByTestId("set-0-weight")).toHaveValue("100");
  await expect(page.getByTestId("committed-0")).not.toBeVisible();

  // No background insert should have fired either.
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("filling weight+reps then tapping away auto-checks off the set", async ({
  page,
}) => {
  const EX = `Checkoff ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");

  // No Enter, no checkmark, no "Add set" — leaving the row with both fields
  // filled is enough to check the set off.
  await page.getByRole("heading", { level: 1 }).click();

  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(page.getByTestId("committed-0")).toBeVisible();
  // Auto-checkoff commits the set but does not auto-spawn the next draft.
  await expect(page.getByTestId("set-1-weight")).not.toBeVisible();
});

test("the checkmark commits the filled draft row", async ({ page }) => {
  const EX = `Check ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");

  // No Enter, no "Add set" — the checkmark alone must commit.
  await page.getByTestId("set-0-done").click();
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);

  // The committed row renders; no new draft row auto-spawns.
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("set-1-weight")).not.toBeVisible();
});

test("opening the set-details sheet does not auto-check the set off", async ({
  page,
}) => {
  // Regression: the "…" (set details) button has a mousedown-preventDefault
  // guard meant to keep the weight/reps input focused so tapping it doesn't
  // trigger auto-checkoff. That guard only stops the button itself from
  // stealing focus — it doesn't account for the details dialog grabbing
  // focus once it opens, which fires the same blur auto-checkoff a beat
  // later.
  const EX = `Details ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-more").click();

  // The sheet opened — the row must not have committed in the process.
  await expect(page.getByTestId("set-0-note")).toBeVisible();
  await expect(page.getByTestId("committed-0")).not.toBeVisible();
  expect(await rowCount(page, "set_logs")).toBe(before);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("set-0-weight")).toHaveValue("100");
  await expect(page.getByTestId("set-0-reps")).toHaveValue("5");
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("tapping the set-details sheet open on a touch device does not auto-check the set off", async ({
  page,
}) => {
  // Touch twin of the click test above: this whole guard rests on the tap
  // routing through mousedown-preventDefault before the dialog's autofocus
  // blurs the input, and touch doesn't route through mousedown the same way
  // a mouse does — so the primary mobile surface needs its own proof.
  const EX = `DetailsTap ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-more").tap();

  await expect(page.getByTestId("set-0-note")).toBeVisible();
  await expect(page.getByTestId("committed-0")).not.toBeVisible();
  expect(await rowCount(page, "set_logs")).toBe(before);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("set-0-weight")).toHaveValue("100");
  await expect(page.getByTestId("set-0-reps")).toHaveValue("5");
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("tabbing to the set-details trigger does not auto-check the set off", async ({
  page,
}) => {
  // Keyboard route into the same trigger: Tab really does move focus onto the
  // "…" button (mousedown-preventDefault only covers pointers), and that blur
  // lands before any click can arm the guard. Committing there would unmount
  // the button mid-Tab, so set details would be unreachable by keyboard on a
  // complete-but-uncommitted row.
  const EX = `DetailsTab ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  // Tab passes through the in-row B/L·R segmented control (two segments)
  // before reaching the "…" trigger — the guard must hold across all of
  // them.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  await expect(page.getByTestId("set-0-more")).toBeFocused();
  await expect(page.getByTestId("committed-0")).not.toBeVisible();
  expect(await rowCount(page, "set_logs")).toBe(before);

  // …and the trigger still opens the sheet from there.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("set-0-note")).toBeVisible();
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("a set-details sheet opened with no field focused still allows a later checkoff", async ({
  page,
}) => {
  // The guard is armed when the sheet opens, but nothing blurs to consume it
  // when the sheet opens from an unfocused row — closing the sheet has to
  // clear it, or the next genuine tap-away is swallowed and the set never
  // checks off.
  const EX = `DetailsIdle ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  // Leave the row first: reps is empty, so this can't commit — it just drops
  // focus, so opening the sheet next arms the guard with no blur to spend it.
  await page.getByRole("heading", { level: 1 }).click();
  await page.getByTestId("set-0-more").tap();
  await expect(page.getByTestId("set-0-note")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("set-0-note")).not.toBeVisible();

  await page.getByTestId("set-0-reps").fill("5");
  await page.getByRole("heading", { level: 1 }).click();

  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("set-1-weight")).not.toBeVisible();
});

test("closing the set-details sheet from inside it still allows a later checkoff", async ({
  page,
}) => {
  // "Plate calculator" closes the sheet with setDetailsOpen(false) directly,
  // so the dialog's onOpenChange never runs — only reacting to the closed
  // state itself disarms the guard on this path.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId("pick-exercise-Barbell Squat").click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByRole("heading", { level: 1 }).click();
  await page.getByTestId("set-0-more").tap();
  await page.getByTestId("set-0-plates").tap();
  await expect(page.getByTestId("plates-Barbell Squat")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("set-0-reps").fill("5");
  await page.getByRole("heading", { level: 1 }).click();

  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(page.getByTestId("committed-0")).toBeVisible();
});

test("tapping the checkmark on a touch device commits exactly one set", async ({
  page,
}) => {
  // Regression: on a real touch device, tapping the checkmark while the reps
  // field still holds focus fires touchstart-driven blur (auto-checkoff)
  // *and* the button's click — a mousedown-preventDefault guard stops this on
  // desktop mice, but touch doesn't route through mousedown the same way, so
  // both `commit()` calls could land as two separate rows without the fix.
  const EX = `Tap ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-done").tap();

  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("committed-1")).not.toBeVisible();
  await expect(page.getByTestId("set-1-weight")).not.toBeVisible();
});
