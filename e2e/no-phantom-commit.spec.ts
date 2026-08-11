import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  pullUpLogger,
  rowCount,
  signIn,
  waitForExercise,
} from "./helpers";

// Nothing commits a set except an explicit act. The session's split
// read/write design (option E) put every input in one bottom drawer, and the
// drawer's fields are never a "row" that can check itself off: leaving them —
// to tap the machine chip, the laterality toggle, the set-details ⋯, or the
// page header — must never write a set. Only "Log set N" and Enter do.
//
// (This replaces the pre-redesign auto-checkoff contract, where blurring a
// complete draft row committed it. That behaviour is deliberately gone: with
// the fields inside a drawer full of other controls, every one of those taps
// would have been a phantom commit.)

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function startWith(page: import("@playwright/test").Page, ex: string) {
  await page.goto("/library");
  await createExercise(page, ex);
  await expect(page.getByTestId(`exercise-row-${ex}`)).toBeVisible();
  await waitForExercise(page, ex);
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${ex}`).click();
}

test("leaving a half-filled logger does not commit a set", async ({ page }) => {
  await startWith(page, `Phantom ${Date.now()}`);

  const before = await rowCount(page, "set_logs");
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  // Leave the field without touching Log set — tap the drawer's own title.
  await page.getByTestId("logger-title").click();

  await expect(page.getByTestId("set-0-weight")).toHaveValue("100");
  await expect(page.getByTestId("committed-0")).not.toBeVisible();
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("leaving a fully-filled logger does not commit a set either", async ({
  page,
}) => {
  await startWith(page, `Checkoff ${Date.now()}`);

  const before = await rowCount(page, "set_logs");
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("logger-title").click();

  // Both fields are filled — and still nothing is written until Log set.
  await expect(page.getByTestId("committed-0")).not.toBeVisible();
  expect(await rowCount(page, "set_logs")).toBe(before);
  await expect(page.getByTestId("set-0-weight")).toHaveValue("100");
  await expect(page.getByTestId("set-0-reps")).toHaveValue("5");
});

test("Log set commits the filled set", async ({ page }) => {
  await startWith(page, `Check ${Date.now()}`);

  const before = await rowCount(page, "set_logs");
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();

  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("committed-1")).not.toBeVisible();
});

test("opening the set-details sheet does not commit the set", async ({
  page,
}) => {
  await startWith(page, `Details ${Date.now()}`);

  const before = await rowCount(page, "set_logs");
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-more").click();

  await expect(page.getByTestId("set-0-note")).toBeVisible();
  await expect(page.getByTestId("committed-0")).not.toBeVisible();
  expect(await rowCount(page, "set_logs")).toBe(before);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("set-0-weight")).toHaveValue("100");
  await expect(page.getByTestId("set-0-reps")).toHaveValue("5");
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("tapping the set-details sheet open on a touch device does not commit", async ({
  page,
}) => {
  // Touch twin of the click test above — the primary mobile surface gets its
  // own proof, since touch and mouse route focus differently.
  await startWith(page, `DetailsTap ${Date.now()}`);

  const before = await rowCount(page, "set_logs");
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-more").tap();

  await expect(page.getByTestId("set-0-note")).toBeVisible();
  await expect(page.getByTestId("committed-0")).not.toBeVisible();
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("switching the laterality toggle does not commit the set", async ({
  page,
}) => {
  // The four-state laterality control sits between the fields and Log set, so
  // a blur-commit here would log a bilateral set the moment you reached for
  // "L+R" — exactly the class of phantom commit this suite guards.
  await startWith(page, `Lat ${Date.now()}`);

  const before = await rowCount(page, "set_logs");
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("40");
  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-lat-pair").click();

  await expect(page.getByTestId("set-0-panel-right")).toBeVisible();
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("tapping Log set on a touch device commits exactly one set", async ({
  page,
}) => {
  await startWith(page, `Tap ${Date.now()}`);

  const before = await rowCount(page, "set_logs");
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").tap();

  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("committed-1")).not.toBeVisible();
});
