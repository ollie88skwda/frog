import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// M2 routine → session integration: build a routine with a fixed-target set and
// a rep-range set, start it (draft grid prefilled from the targets, PREVIOUS
// blank the first time), log the sets, finish with Update-Routine-Values ON,
// and confirm the fixed set's target updated while the rep-range set did not.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  // Force kg so builder inputs round-trip 1:1 to the session grid.
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

async function routineIdByName(page: Page, name: string): Promise<string> {
  return page.evaluate(async (n) => {
    const { data, error } = await window.__frog.supabase
      .from("routines")
      .select("id")
      .eq("name", n)
      .is("deleted_at", null)
      .limit(1);
    if (error) throw new Error(error.message);
    return (data?.[0]?.id as string) ?? "";
  }, name);
}

test("start routine prefills the grid, PREVIOUS is blank, and Update Routine Values writes back fixed (not rep-range) sets", async ({
  page,
}) => {
  const EX = `RoutineEx ${Date.now()}`;
  const ROUTINE = `Routine ${Date.now()}`;

  // Exercise to build the routine around.
  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, EX);

  // Build a routine: set 0 fixed (60×5), set 1 rep-range (50 × 8–12).
  await page.goto("/train");
  await page.getByTestId("new-routine-btn").click();
  await expect(page).toHaveURL(/\/routines\/new/);
  await page.getByTestId("routine-name-input").fill(ROUTINE);
  await page.getByTestId("routine-add-exercise-btn").click();
  await page.getByTestId(`routine-pick-${EX}`).click();

  await page.getByTestId("routine-ex-0-set-0-weight").fill("60");
  await page.getByTestId("routine-ex-0-set-0-reps").fill("5");
  await page.getByTestId("routine-ex-0-set-1-weight").fill("50");
  await page.getByTestId("routine-ex-0-set-1-reps").fill("8");
  await page.getByTestId("routine-ex-0-set-1-repsmax").fill("12");
  await page.getByTestId("routine-save-btn").click();
  await expect(page).toHaveURL(/\/train$/);

  // Start the routine → prefilled session.
  await page.getByTestId(`routine-start-${ROUTINE}`).click();
  await expect(page).toHaveURL(/\/session\//);

  // Set 0 draft is seeded from the fixed target; PREVIOUS is blank (never logged).
  await expect(page.getByTestId("set-0-weight")).toHaveValue("60");
  await expect(page.getByTestId("set-0-reps")).toHaveValue("5");
  await expect(page.getByTestId("set-0-previous")).toHaveText("—");

  // Perform set 0 heavier than the target (65 instead of 60).
  await page.getByTestId("set-0-weight").fill("65");
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId("committed-0")).toBeVisible();

  // Set 1 draft: weight seeded (50), reps left blank for the 8–12 range.
  await expect(page.getByTestId("set-1-weight")).toHaveValue("50");
  await expect(page.getByTestId("set-1-reps")).toHaveValue("");
  await page.getByTestId("set-1-reps").fill("10");
  await page.getByTestId("set-1-add").click();
  await expect(page.getByTestId("committed-1")).toBeVisible();

  // Finish with Update Routine Values ON (default).
  await page.getByTestId("end-session-btn").click();
  await expect(page.getByTestId("finish-summary")).toBeVisible();
  await expect(page.getByTestId("finish-update-values")).toBeChecked();
  await page.getByTestId("finish-save").click();
  await expect(page).toHaveURL(/\/history\//);

  // Reopen the routine: fixed set 0 now 65×5, rep-range set 1 unchanged (50, 8–12).
  const routineId = await routineIdByName(page, ROUTINE);
  expect(routineId).not.toBe("");
  await page.goto(`/routines/${routineId}/edit`);
  await expect(page.getByTestId("routine-ex-0-set-0-weight")).toHaveValue("65");
  await expect(page.getByTestId("routine-ex-0-set-0-reps")).toHaveValue("5");
  await expect(page.getByTestId("routine-ex-0-set-1-weight")).toHaveValue("50");
  // Rep-range set NEVER auto-updates — reps stay at the original 8 (not 10).
  await expect(page.getByTestId("routine-ex-0-set-1-reps")).toHaveValue("8");
  await expect(page.getByTestId("routine-ex-0-set-1-repsmax")).toHaveValue("12");
});

// The session row and its exercises are fetched in parallel; when the
// exercises win, routineId isn't known yet. Mounting the grid then would seed
// it blank for good (blocks seed once). Delaying the session GET makes that
// ordering deterministic instead of a coin flip under CI load.
test("start routine still prefills when the session row resolves after its exercises", async ({
  page,
}) => {
  const EX = `RaceEx ${Date.now()}`;
  const ROUTINE = `Race routine ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("new-routine-btn").click();
  await page.getByTestId("routine-name-input").fill(ROUTINE);
  await page.getByTestId("routine-add-exercise-btn").click();
  await page.getByTestId(`routine-pick-${EX}`).click();
  await page.getByTestId("routine-ex-0-set-0-weight").fill("60");
  await page.getByTestId("routine-ex-0-set-0-reps").fill("5");
  await page.getByTestId("routine-save-btn").click();
  await expect(page).toHaveURL(/\/train$/);

  await page.route(/\/rest\/v1\/sessions\?/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.getByTestId(`routine-start-${ROUTINE}`).click();
  await expect(page).toHaveURL(/\/session\//);
  await expect(page.getByTestId("set-0-weight")).toHaveValue("60");
  await expect(page.getByTestId("set-0-reps")).toHaveValue("5");
});

// Regression: starting a routine with N configured sets used to render only
// the one active (currently-being-logged) row — the other N-1 were invisible
// until each prior set was logged, which read as "the routine only kept 1 of
// my 5 sets." All N are now visible immediately: one editable active row plus
// read-only "upcoming" previews for the rest, counting down as sets are logged.
test("start routine materializes every configured set as a visible row, not just the active one", async ({
  page,
}) => {
  const EX = `MaterializeEx ${Date.now()}`;
  const ROUTINE = `Materialize routine ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, EX);

  // 5 identical rep-range sets (6-8), matching the reported repro exactly.
  await page.goto("/train");
  await page.getByTestId("new-routine-btn").click();
  await page.getByTestId("routine-name-input").fill(ROUTINE);
  await page.getByTestId("routine-add-exercise-btn").click();
  await page.getByTestId(`routine-pick-${EX}`).click();
  await page.getByTestId("routine-ex-0-add-set").click(); // 3 → 4
  await page.getByTestId("routine-ex-0-add-set").click(); // 4 → 5
  for (let i = 0; i < 5; i++) {
    await page.getByTestId(`routine-ex-0-set-${i}-reps`).fill("6");
    await page.getByTestId(`routine-ex-0-set-${i}-repsmax`).fill("8");
  }
  await page.getByTestId("routine-save-btn").click();
  await expect(page).toHaveURL(/\/train$/);

  await page.getByTestId(`routine-start-${ROUTINE}`).click();
  await expect(page).toHaveURL(/\/session\//);

  // Set 0 is the active, editable row; sets 1-4 are read-only upcoming
  // previews — all 5 configured sets are on screen with zero user action.
  await expect(page.getByTestId("set-0-reps")).toBeVisible();
  for (let i = 1; i < 5; i++) {
    await expect(page.getByTestId(`upcoming-${i}-reps`)).toHaveText("6–8");
  }

  // Logging set 0 advances the active row to index 1 and drops it from the
  // upcoming list — the previously-seeded target isn't left behind or
  // duplicated, and it isn't something the user had to re-add by hand.
  await page.getByTestId("set-0-reps").fill("7");
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("set-1-reps")).toBeVisible();
  await expect(page.getByTestId("upcoming-1-reps")).toHaveCount(0);
  for (let i = 2; i < 5; i++) {
    await expect(page.getByTestId(`upcoming-${i}-reps`)).toHaveText("6–8");
  }
});
