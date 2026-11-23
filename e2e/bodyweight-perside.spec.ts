import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";
import { finishSession, openSetTypeMenu } from "./spotlight-helpers";

// Bodyweight-reps exercises have no weight field. A per-side (unilateral) set
// must show a real, editable right-side reps input (defaulting to the left
// value as its ghost), never save hidden or stale right reps. Bilateral
// bodyweight sets keep the generic panel (Last time row, set-delta line).

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

async function makeBodyweight(page: Page, label: string): Promise<string> {
  const name = `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/library");
  await page.getByTestId("new-exercise-btn").click();
  await page.getByTestId("exercise-name-input").fill(name);
  await page.getByTestId("exercise-type-select").click();
  await page
    .getByRole("option", { name: "Bodyweight reps", exact: true })
    .click();
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, name);
  return name;
}

async function start(page: Page, name: string) {
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${name}`).click();
  await expect(page.getByTestId("reps-field")).toBeVisible();
}

async function makePerSide(page: Page) {
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await expect(page.getByTestId("reps-field-right")).toBeVisible();
}

/** set_logs rows (side, reps) for this exercise's newest session_exercise. */
function readRows(page: Page, name: string) {
  return page.evaluate(async (exerciseName) => {
    const sb = window.__frog.db;
    const { data: ex, error: exErr } = await sb
      .from("exercises")
      .select("id")
      .eq("name", exerciseName)
      .single();
    if (exErr) throw new Error(exErr.message);
    const { data: ses, error: seErr } = await sb
      .from("session_exercises")
      .select("id")
      .eq("exercise_id", (ex as { id: string }).id);
    if (seErr) throw new Error(seErr.message);
    const out: { set_no: number; side: string | null; reps: number | null }[] =
      [];
    for (const se of (ses ?? []) as { id: string }[]) {
      const { data, error } = await sb
        .from("set_logs")
        .select("set_no, side, reps")
        .eq("session_exercise_id", se.id);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as typeof out));
    }
    return out.sort((a, b) => (a.side ?? "").localeCompare(b.side ?? ""));
  }, name);
}

test("unilateral bodyweight: right reps defaults to the left value when left blank", async ({
  page,
}) => {
  const EX = await makeBodyweight(page, "BwUniDefault");
  await start(page, EX);
  await makePerSide(page);

  // No weight column on a bodyweight type.
  await expect(page.getByTestId("weight-field")).toHaveCount(0);

  await page.getByTestId("reps-field-left").fill("10");
  // The right input itself is empty; the left value is only its ghost.
  const right = page.getByTestId("reps-field-right");
  await expect(right).toHaveValue("");
  await expect(right.locator("xpath=following-sibling::span[1]")).toContainText(
    "10",
  );
  await expect(right.locator("xpath=following-sibling::span[1]")).toBeVisible();

  await page.getByTestId("log-set").click();
  await expect.poll(() => readRows(page, EX)).toHaveLength(2);
  const rows = await readRows(page, EX);
  expect(rows.map((r) => [r.side, r.reps])).toEqual([
    ["left", 10],
    ["right", 10],
  ]);
});

test("unilateral bodyweight: right reps can be cleared and retyped (no snap-back)", async ({
  page,
}) => {
  const EX = await makeBodyweight(page, "BwUniClear");
  await start(page, EX);
  await makePerSide(page);

  await page.getByTestId("reps-field-left").fill("10");
  const reps = page.getByTestId("reps-field-right");
  await reps.click();
  await reps.pressSequentially("12");
  await expect(reps).toHaveValue("12");
  await reps.press("Backspace");
  await reps.press("Backspace");
  // Cleared input stays empty instead of snapping back to the left's 10.
  await expect(reps).toHaveValue("");
  await reps.pressSequentially("8");
  await expect(reps).toHaveValue("8");

  // Left side still holds its own value.
  await expect(page.getByTestId("reps-field-left")).toHaveValue("10");

  await page.getByTestId("log-set").click();
  await expect.poll(() => readRows(page, EX)).toHaveLength(2);
  const rows = await readRows(page, EX);
  expect(rows.map((r) => [r.side, r.reps])).toEqual([
    ["left", 10],
    ["right", 8],
  ]);
});

test("unilateral bodyweight: editing a logged set changes the right reps", async ({
  page,
}) => {
  const EX = await makeBodyweight(page, "BwUniEdit");
  await start(page, EX);
  await makePerSide(page);
  await page.getByTestId("reps-field-left").fill("10");
  await page.getByTestId("reps-field-right").fill("9");
  await page.getByTestId("log-set").click();
  await expect.poll(() => readRows(page, EX)).toHaveLength(2);

  await page.getByTestId("set-mark-0").click();
  await expect(page.getByTestId("reps-field-right")).toHaveValue("9");
  await page.getByTestId("reps-field-right").fill("7");
  await page.getByTestId("log-set").click();

  await expect
    .poll(async () => (await readRows(page, EX)).map((r) => [r.side, r.reps]))
    .toEqual([
      ["left", 10],
      ["right", 7],
    ]);
});

test("bilateral bodyweight keeps the generic panel with the Last time row", async ({
  page,
}) => {
  const EX = await makeBodyweight(page, "BwBilateral");
  await start(page, EX);
  await expect(page.getByTestId("perside-row")).toHaveCount(0);
  await page.getByTestId("reps-field").fill("12");
  await page.getByTestId("log-set").click();
  await expect.poll(() => readRows(page, EX)).toHaveLength(1);
  await finishSession(page);

  await start(page, EX);
  await expect(page.getByTestId("perside-row")).toHaveCount(0);
  await expect(page.getByTestId("last-time-row")).toBeVisible();
  await expect(page.getByTestId("last-time-row")).toContainText("12");
  await expect(page.getByTestId("last-time-reset")).toBeVisible();
  await page.getByTestId("reps-field").fill("14");
  await expect(page.getByTestId("set-delta")).toBeVisible();
  await page.screenshot({
    path: `${process.env.EVIDENCE_DIR ?? "test-results"}/bw-bilateral-generic.png`,
  });
});
