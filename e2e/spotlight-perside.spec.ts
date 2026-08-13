import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import { logBilateralSet, makeExercise, startSessionWith } from "./spotlight-helpers";

// Per-side sets (testid-contract.md: "Per-side variants append -left/-right
// ... The shared weight in per-side mode stays weight-field, plus
// weight-link-toggle for the link/unlink control").

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makePerSide(page: import("@playwright/test").Page) {
  await page.getByTestId("set-type-menu").click();
  await page.getByTestId("set-type-perside").click();
}

test("a per-side set shares one weight field but splits reps per side", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideShape");
  await startSessionWith(page, EX);
  await makePerSide(page);

  await expect(page.getByTestId("weight-field")).toBeVisible();
  await expect(page.getByTestId("reps-field-left")).toBeVisible();
  await expect(page.getByTestId("reps-field-right")).toBeVisible();
  // No single shared reps field once per-side is on.
  await expect(page.getByTestId("reps-field")).toHaveCount(0);

  await page.getByTestId("weight-field").fill("40");
  await page.getByTestId("reps-field-left").fill("8");
  await page.getByTestId("reps-field-right").fill("6");
  await page.getByTestId("log-set").click();

  // Two set_logs rows sharing set_no=0, one per side.
  const rows = await page.evaluate(async () => {
    const sb = window.__frog.supabase;
    const { data, error } = await sb
      .from("set_logs")
      .select("set_no, side, weight_kg, reps")
      .eq("set_no", 0)
      .order("side");
    if (error) throw new Error(error.message);
    return data;
  });
  expect(rows).toHaveLength(2);
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

  await page.getByTestId("weight-field").fill("40");
  await page.getByTestId("reps-field-left").fill("8");
  await page.getByTestId("reps-field-right").fill("8");
  await page.getByTestId("rir-option-1-left").click();
  await page.getByTestId("rir-option-3-right").click();
  await page.getByTestId("log-set").click();

  const rows = await page.evaluate(async () => {
    const sb = window.__frog.supabase;
    const { data, error } = await sb
      .from("set_logs")
      .select("side, rir, rir_min, rir_max")
      .eq("set_no", 0);
    if (error) throw new Error(error.message);
    return data;
  });
  const left = rows?.find((r) => r.side === "left");
  const right = rows?.find((r) => r.side === "right");
  // Whichever RIR column the implementation uses, left and right must
  // disagree — that's the behaviour under test, not the exact column shape.
  const leftRir = left?.rir ?? left?.rir_min;
  const rightRir = right?.rir ?? right?.rir_min;
  expect(leftRir).not.toBe(rightRir);
});

test("unlinking the shared weight splits it per side; linking recombines it", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideLink");
  await startSessionWith(page, EX);
  await makePerSide(page);

  // Linked (default per the mockup): one shared weight-field.
  await expect(page.getByTestId("weight-field")).toBeVisible();
  await expect(page.getByTestId("weight-field-left")).toHaveCount(0);

  await page.getByTestId("weight-link-toggle").click();
  // Unlinked: weight follows the same per-side testid pattern as reps/RIR.
  await expect(page.getByTestId("weight-field-left")).toBeVisible();
  await expect(page.getByTestId("weight-field-right")).toBeVisible();

  await page.getByTestId("weight-link-toggle").click();
  // Re-linked: back to one shared field.
  await expect(page.getByTestId("weight-field")).toBeVisible();
  await expect(page.getByTestId("weight-field-left")).toHaveCount(0);
});

test("a per-side set and a bilateral set can sit back to back in one exercise", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideMixed");
  await startSessionWith(page, EX);

  // Set 0: per-side.
  await makePerSide(page);
  await page.getByTestId("weight-field").fill("40");
  await page.getByTestId("reps-field-left").fill("8");
  await page.getByTestId("reps-field-right").fill("8");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("set-mark-0-side-tag")).toBeVisible();

  // Set 1: plain bilateral — no leftover per-side UI.
  await expect(page.getByTestId("reps-field")).toBeVisible();
  await expect(page.getByTestId("reps-field-left")).toHaveCount(0);
  await logBilateralSet(page, "45", "10");
  await expect(page.getByTestId("set-mark-1-side-tag")).toHaveCount(0);
});
