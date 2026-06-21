import { test, expect, type Page } from "@playwright/test";

// Headless E2E of SBL's core loop, driving the REAL app screens (app/library.tsx,
// app/index.tsx, app/session/[id].tsx) and the REAL db query functions (src/db/*)
// compiled to web. The only test-specific swap is the SQLite driver (sql.js
// instead of expo-sqlite) — see e2e/web/test-client.ts and e2e/README.html.
// sql.js bytes are persisted to localStorage, so a page reload is the web analogue
// of an app relaunch.
//
// WEB COVERAGE NOTE: react-native-web does not implement TextInput's
// `onEndEditing` (verified: 0 references in react-native-web). The session screen
// logs sets via `onEndEditing`, so set-logging — and the ghost prefill that
// depends on logged sets — cannot be driven through the real UI on web. Those two
// steps are covered on-device by the Maestro flow (e2e/flows/core-loop.yaml) and at
// the unit level by Vitest (logSet / lastSetsForExercise / session-reducer). This
// spec verifies every core-loop step that web faithfully supports AND asserts the
// set-logging gap so a future fix (web blur handling) flips the xfail to a pass.

const RAW = "window.__SBL_RAW_DB__";

async function waitForBoot(page: Page) {
  await page.waitForFunction(() => (window as any).__SBL_E2E_DB_READY__ === true, {
    timeout: 20_000,
  });
  const bootErr = await page.evaluate(() => (window as any).__SBL_E2E_BOOT_ERROR__);
  expect(bootErr, "E2E entry should boot sql.js without error").toBeFalsy();
}

async function rowCount(page: Page, table: string): Promise<number> {
  return page.evaluate((t) => {
    const db = (window as any).__SBL_RAW_DB__;
    const r = db.exec(`select count(*) from ${t}`);
    return r[0]?.values?.[0]?.[0] ?? 0;
  }, table);
}

test.beforeEach(async ({ page }) => {
  // Start each run from a clean on-device store.
  await page.goto("/");
  await waitForBoot(page);
  await page.evaluate(() => localStorage.removeItem("sbl-e2e-sqljs"));
  await page.reload();
  await waitForBoot(page);
});

test("core loop (web-supported steps): add exercise, pick in session, persistence", async ({
  page,
}) => {
  const EX = `Bench ${Date.now()}`;

  // 1) Library: add an exercise -> it appears in the list, and is in the DB.
  await page.goto("/library");
  await waitForBoot(page);
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  expect(await rowCount(page, "exercises")).toBe(1);

  // 2) Train: start a session, then pick that exercise (writes a session_exercise).
  await page.goto("/");
  await waitForBoot(page);
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await expect(page.getByTestId("set-0-weight")).toBeVisible(); // set rows render
  expect(await rowCount(page, "sessions")).toBe(1);
  expect(await rowCount(page, "session_exercises")).toBe(1);

  // 4) Relaunch (reload) -> exercise + session persist from on-device storage.
  await page.goto("/library");
  await waitForBoot(page);
  await page.reload();
  await waitForBoot(page);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  expect(await rowCount(page, "exercises")).toBe(1);
  expect(await rowCount(page, "sessions")).toBe(1);
});

// Documents the known RN-web gap so it can't regress silently and so a future web
// blur fix turns this green. Filling the set inputs and blurring should — but on
// web does NOT — write a set_logs row, because react-native-web ignores
// onEndEditing.
test("KNOWN WEB GAP: set logging via onEndEditing does not fire on react-native-web", async ({
  page,
}) => {
  const EX = `Gap ${Date.now()}`;

  await page.goto("/library");
  await waitForBoot(page);
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();

  await page.goto("/");
  await waitForBoot(page);
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const w = page.getByTestId("set-0-weight");
  const r = page.getByTestId("set-0-reps");
  await w.click();
  await w.fill("135");
  await w.blur();
  await r.click();
  await r.fill("5");
  await r.blur();

  // If react-native-web ever wires blur -> onEndEditing (or the app adds onBlur),
  // this becomes 1 and the assertion below should be updated to expect a logged
  // set + ghost prefill. Today it is 0.
  expect(
    await rowCount(page, "set_logs"),
    "onEndEditing is unsupported on web; no set is logged (device-only step)"
  ).toBe(0);
});
