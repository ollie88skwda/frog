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
