import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// A weighted set never saves without a weight; bodyweight exercises may be
// blank; RIR is per set and never carried forward.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

async function startWith(page: Page, name: string) {
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  const id = page.url().split("/session/")[1];
  await page.getByTestId(`pick-exercise-${name}`).click();
  return id;
}

test("weighted exercise refuses a set with no weight and shows the inline error", async ({
  page,
}) => {
  const EX = `NoWeight ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  await startWith(page, EX);

  await page.getByTestId("reps-field").fill("6");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("weight-error")).toBeVisible();
  await expect(page.getByTestId("set-mark-0-state")).not.toHaveAttribute(
    "data-state",
    "done",
  );

  await page.getByTestId("weight-field").fill("60");
  await expect(page.getByTestId("weight-error")).toHaveCount(0);
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
});

test("bodyweight exercise saves with a blank weight", async ({ page }) => {
  const EX = `BW ${Date.now()}`;
  await page.goto("/library");
  await page.getByTestId("new-exercise-btn").click();
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("exercise-type-select").click();
  await page
    .getByRole("option", { name: "Bodyweight reps", exact: true })
    .click();
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, EX);
  await startWith(page, EX);

  await page.getByTestId("reps-field").fill("10");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("weight-error")).toHaveCount(0);
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
});

test("RIR on set 1 only leaves sets 2-3 blank in history", async ({ page }) => {
  const EX = `Rir ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  const id = await startWith(page, EX);

  for (let i = 0; i < 3; i++) {
    await page.getByTestId("weight-field").fill("100");
    await page.getByTestId("reps-field").fill("6");
    if (i === 0) await page.getByTestId("rir-option-2").click();
    else
      await expect(page.getByTestId("rir-option-2")).not.toHaveAttribute(
        "aria-pressed",
        "true",
      );
    await page.getByTestId("log-set").click();
    await expect(page.getByTestId(`set-mark-${i}-state`)).toHaveAttribute(
      "data-state",
      "done",
    );
  }

  await page.getByTestId("session-finish").click();
  await page.getByTestId("finish-save").click();
  await expect(page).toHaveURL(new RegExp(`/history/${id}`));

  const rows = await page.evaluate(async () => {
    const { data } = await window.__frog.db
      .from("set_logs")
      .select("set_no,rir_min,rir_max,created_at")
      .order("created_at", { ascending: false })
      .limit(3);
    return data ?? [];
  });
  const bySet = Object.fromEntries(
    rows.map((r: { set_no: number; rir_min: number | null }) => [
      r.set_no,
      r.rir_min,
    ]),
  );
  expect(bySet[0]).toBe(2);
  expect(bySet[1] ?? null).toBeNull();
  expect(bySet[2] ?? null).toBeNull();
});

test("planned RIR is an outlined hint: untouched saves blank, tapping it saves the value", async ({
  page,
}) => {
  const EX = `RirPlan ${Date.now()}`;
  const ROUTINE = `RirPlan routine ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/routines");
  await page.getByTestId("new-routine-btn").click();
  await page.getByTestId("routine-name-input").fill(ROUTINE);
  await page.getByTestId("routine-add-exercise-btn").click();
  await page.getByTestId(`routine-pick-${EX}`).click();
  for (const i of [0, 1]) {
    await page.getByTestId(`routine-ex-0-set-${i}-reps`).fill("6");
    await page.getByTestId(`routine-ex-0-set-${i}-rirmin`).fill("1");
    await page.getByTestId(`routine-ex-0-set-${i}-rirmax`).fill("3");
  }
  await page.getByTestId("routine-save-btn").click();
  await expect(page).toHaveURL(/\/plan\?s=routines$/);
  await page.getByTestId(`routine-start-${ROUTINE}`).click();
  await expect(page).toHaveURL(/\/session\//);

  // Set 1: the plan's midpoint (1-3 -> 2) is outlined, nothing is pressed,
  // and logging without a tap saves a blank RIR next to the stored plan.
  await expect(page.getByTestId("rir-option-2")).toHaveAttribute(
    "data-hint",
    "true",
  );
  for (const v of ["0", "1", "2", "3", "4plus"])
    await expect(page.getByTestId(`rir-option-${v}`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  await page.getByTestId("weight-field").fill("100");
  await page.getByTestId("reps-field").fill("6");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );

  // Set 2: one tap on the hint accepts it.
  await expect(page.getByTestId("rir-option-2")).toHaveAttribute(
    "data-hint",
    "true",
  );
  await page.getByTestId("weight-field").fill("100");
  await page.getByTestId("reps-field").fill("6");
  await page.getByTestId("rir-option-2").click();
  await expect(page.getByTestId("rir-option-2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("set-mark-1-state")).toHaveAttribute(
    "data-state",
    "done",
  );

  const rows = await page.evaluate(async () => {
    const { data } = await window.__frog.db
      .from("set_logs")
      .select("set_no,rir_min,planned_rir_min,planned_rir_max,created_at")
      .order("created_at", { ascending: false })
      .limit(2);
    return data ?? [];
  });
  type R = {
    set_no: number;
    rir_min: number | null;
    planned_rir_min: number | null;
    planned_rir_max: number | null;
  };
  const bySet = Object.fromEntries(rows.map((r: R) => [r.set_no, r]));
  expect(bySet[0]?.rir_min ?? null).toBeNull();
  expect(bySet[0]?.planned_rir_min).toBe(1);
  expect(bySet[0]?.planned_rir_max).toBe(3);
  expect(bySet[1]?.rir_min).toBe(2);
});
