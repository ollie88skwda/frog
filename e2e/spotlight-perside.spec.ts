import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";
import {
  fillSide,
  logBilateralSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Per-side sets (testid-contract.md: "Per-side variants append -left/-right
// ... The shared weight in per-side mode stays weight-field, plus
// weight-link-toggle for the link/unlink control").

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  // Display kg so typed weights map 1:1 to the canonical weight_kg store
  // this file asserts directly (the app defaults to lb).
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

async function makePerSide(page: import("@playwright/test").Page) {
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
}

test("a per-side set shares one weight field but splits reps per side", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideShape");
  await startSessionWith(page, EX);
  await makePerSide(page);

  // Both sides on screen at once, no side tabs.
  await expect(page.getByTestId("reps-field-left")).toBeVisible();
  await expect(page.getByTestId("reps-field-right")).toBeVisible();
  await expect(page.getByTestId("side-tabs")).toHaveCount(0);

  await fillSide(page, "left", "40", "8");
  await fillSide(page, "right", "40", "6");
  await page.getByTestId("log-set").click();

  // Two set_logs rows sharing set_no=0, one per side — scoped to this
  // exercise's own session_exercise (a bare set_no=0 filter would catch
  // every other exercise's set 0 on this shared e2e account too). Logging
  // is a fire-and-forget optimistic write (AGENTS.md), so poll rather than
  // read the moment after the click — every other spec asserting a
  // set_logs row (core-loop, edit-delete, exercise-types, lifecycle,
  // rebrand-compat) does the same via expect.poll.
  const readRows = () =>
    page.evaluate(async (exerciseName) => {
      const sb = window.__frog.db;
      const { data: ex, error: exErr } = await sb
        .from("exercises")
        .select("id")
        .eq("name", exerciseName)
        .single();
      if (exErr) throw new Error(exErr.message);
      const { data: se, error: seErr } = await sb
        .from("session_exercises")
        .select("id")
        .eq("exercise_id", (ex as { id: string }).id)
        .single();
      if (seErr) throw new Error(seErr.message);
      const { data, error } = await sb
        .from("set_logs")
        .select("set_no, side, weight_kg, reps")
        .eq("session_exercise_id", (se as { id: string }).id)
        .eq("set_no", 0)
        .order("side");
      if (error) throw new Error(error.message);
      return data;
    }, EX);
  await expect.poll(readRows).toHaveLength(2);
  const rows = await readRows();
  const left = rows?.find((r) => r.side === "left");
  const right = rows?.find((r) => r.side === "right");
  expect(left?.reps).toBe(8);
  expect(right?.reps).toBe(6);
  expect(left?.weight_kg).toBe(40);
  expect(right?.weight_kg).toBe(40);
});

test("per-side RIR is independent per side", async ({ page }) => {
  const EX = await makeExercise(page, "PerSideRir");
  await startSessionWith(page, EX);
  await makePerSide(page);

  await fillSide(page, "left", "40", "8");
  await fillSide(page, "right", "40", "8");
  // One ruler, driving whichever RIR is selected (no tap chips per side).
  await page.getByTestId("rir-column-left").click();
  await page.getByTestId("rir-ruler").focus();
  await page.keyboard.press("ArrowLeft"); // from the default 2 → 1
  await page.getByTestId("rir-column-right").click();
  await page.getByTestId("rir-ruler").focus();
  await page.keyboard.press("ArrowRight"); // 2 → 3
  await expect(page.getByTestId("rir-column-left")).toHaveText("1");
  await expect(page.getByTestId("rir-column-right")).toHaveText("3");
  await page.getByTestId("log-set").click();

  const rows = await page.evaluate(async (exerciseName) => {
    const sb = window.__frog.db;
    const { data: ex, error: exErr } = await sb
      .from("exercises")
      .select("id")
      .eq("name", exerciseName)
      .single();
    if (exErr) throw new Error(exErr.message);
    const { data: se, error: seErr } = await sb
      .from("session_exercises")
      .select("id")
      .eq("exercise_id", (ex as { id: string }).id)
      .single();
    if (seErr) throw new Error(seErr.message);
    const { data, error } = await sb
      .from("set_logs")
      .select("side, rir, rir_min, rir_max")
      .eq("session_exercise_id", (se as { id: string }).id)
      .eq("set_no", 0);
    if (error) throw new Error(error.message);
    return data;
  }, EX);
  const left = rows?.find((r) => r.side === "left");
  const right = rows?.find((r) => r.side === "right");
  // Whichever RIR column the implementation uses, left and right must
  // disagree — that's the behaviour under test, not the exact column shape.
  const leftRir = left?.rir ?? left?.rir_min;
  const rightRir = right?.rir ?? right?.rir_min;
  expect(leftRir).not.toBe(rightRir);
});

test("left and right keep fully independent reps; weight splits on request", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideIndep");
  await startSessionWith(page, EX);
  await makePerSide(page);

  await fillSide(page, "left", "40", "8");
  await fillSide(page, "right", "40", "6");
  // Typing on one side never moves the other.
  await page.getByTestId("reps-field-left").fill("9");
  await expect(page.getByTestId("reps-field-right")).toHaveValue("6");
  // Different weight per side: one extra tap from the weight field.
  await page.getByTestId("weight-field").click();
  await page.getByTestId("weight-split-toggle").click();
  await expect(page.getByTestId("weight-field-right")).toHaveValue("40");
  await page.getByTestId("weight-field-right").fill("35");
  await expect(page.getByTestId("weight-field")).toHaveValue("40");
  await page.getByTestId("log-set").click();

  const readRows = () =>
    page.evaluate(async (exerciseName) => {
      const sb = window.__frog.db;
      const { data: ex } = await sb
        .from("exercises")
        .select("id")
        .eq("name", exerciseName)
        .single();
      const { data: se } = await sb
        .from("session_exercises")
        .select("id")
        .eq("exercise_id", (ex as { id: string }).id)
        .single();
      const { data } = await sb
        .from("set_logs")
        .select("side, weight_kg, reps")
        .eq("session_exercise_id", (se as { id: string }).id)
        .order("side");
      return (data ?? []) as {
        side: string;
        weight_kg: number;
        reps: number;
      }[];
    }, EX);
  await expect.poll(readRows).toHaveLength(2);
  const rows = await readRows();
  expect(rows.map((r) => [r.side, r.weight_kg, r.reps])).toEqual([
    ["left", 40, 9],
    ["right", 35, 6],
  ]);
});

test("a per-side set and a bilateral set can sit back to back in one exercise", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideMixed");
  await startSessionWith(page, EX);

  // Set 0: per-side.
  await makePerSide(page);
  await fillSide(page, "left", "40", "8");
  await fillSide(page, "right", "40", "8");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("set-mark-0-side-tag")).toBeVisible();

  // Log never creates a set; "Add a set" opens the next one, still per-side
  // (laterality carries forward) until toggled off.
  await page.getByTestId("add-set").click();
  await expect(page.getByTestId("perside-row")).toBeVisible();
  await page.getByTestId("laterality-both").click();
  await expect(page.getByTestId("perside-row")).toHaveCount(0);
  await expect(page.getByTestId("reps-field")).toBeVisible();
  await logBilateralSet(page, "45", "10");
  await expect(page.getByTestId("set-mark-1-side-tag")).toHaveCount(0);
});

// Regression: the live spotlight's laterality override used to be seeded
// once on mount from set 0's prescription and never re-derived as the live
// (next-to-log) set advanced — a routine mixing bilateral and unilateral
// sets across its indices (e.g. set 0/1 bilateral, set 2 unilateral) would
// silently keep opening every later set bilateral. Fixed by re-syncing the
// override off `activeIndex` whenever it's not a manually-focused past set.
test("a routine's per-set laterality prescription re-syncs as the live set advances", async ({
  page,
}) => {
  const EX = `PerSideResync ${Date.now()}`;
  const ROUTINE = `PerSideResync routine ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  // Build a 3-set routine: set 0 and set 1 stay bilateral (the default),
  // set 2 is flipped to unilateral via the per-set ⋯ menu.
  await page.goto("/routines/new");
  await page.getByTestId("routine-name-input").fill(ROUTINE);
  await page.getByTestId("routine-add-exercise-btn").click();
  await page.getByTestId(`routine-pick-${EX}`).click();

  await page.getByTestId("routine-ex-0-set-0-weight").fill("40");
  await page.getByTestId("routine-ex-0-set-0-reps").fill("8");
  await page.getByTestId("routine-ex-0-set-1-weight").fill("40");
  await page.getByTestId("routine-ex-0-set-1-reps").fill("8");

  await page.getByTestId("routine-ex-0-set-2-menu").click({ force: true });
  await page.getByTestId("routine-ex-0-set-2-laterality-unilateral").click();
  await page.getByTestId("routine-ex-0-set-2-weight").fill("40");
  await page.getByTestId("routine-ex-0-set-2-reps-l").fill("8");

  await page.getByTestId("routine-save-btn").click();
  await expect(page).toHaveURL(/\/plan\?s=routines$/);

  await page.getByTestId(`routine-start-${ROUTINE}`).click();
  await expect(page).toHaveURL(/\/session\//);

  // Log set 0 and set 1 bilaterally, as prescribed.
  await expect(page.getByTestId("set-number")).toContainText("1");
  await logBilateralSet(page, "40", "8");
  await expect(page.getByTestId("set-number")).toContainText("2");
  await logBilateralSet(page, "40", "8");

  // Set 2 is now live (activeIndex advanced past two bilateral commits) —
  // it must open per-side automatically, matching its own prescription,
  // with no manual set-type-menu toggle from this test.
  await expect(page.getByTestId("set-number")).toContainText("3");
  await expect(page.getByTestId("perside-row")).toBeVisible();
});
