import { test, expect, type Page } from "@playwright/test";

// Headless E2E of SBL's core loop, driving the REAL app screens (app/library.tsx,
// app/index.tsx, app/session/[id].tsx) and the REAL db query functions (src/db/*)
// compiled to web. The only test-specific swap is the SQLite driver (sql.js
// instead of expo-sqlite) — see e2e/web/test-client.ts and e2e/README.html.
// sql.js bytes are persisted to localStorage, so a page reload is the web analogue
// of an app relaunch.
//
// WEB COVERAGE NOTE: react-native-web does not implement TextInput's `onEndEditing`,
// so the session screen also persists on `onBlur` (and keeps state via onChangeText).
// That makes the FULL core loop — add exercise, log sets, ghost prefill, persistence —
// drivable through the real UI on web. The Maestro device flow (e2e/flows/core-loop.yaml)
// and Vitest still cover the same logic at the device/unit level.

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

// Set logging + ghost prefill now work on web: onChangeText keeps reducer state in
// sync and onBlur persists the row (since react-native-web ignores onEndEditing).
test("log sets persists to set_logs, and ghost prefill shows the prior session", async ({
  page,
}) => {
  const EX = `Log ${Date.now()}`;

  // Add the exercise.
  await page.goto("/library");
  await waitForBoot(page);
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();

  // Session 1: log one set (135 lb x 5).
  await page.goto("/");
  await waitForBoot(page);
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await page.getByTestId("set-0-weight").fill("135");
  await page.getByTestId("set-0-weight").blur();
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-reps").blur();
  await expect.poll(() => rowCount(page, "set_logs")).toBe(1);

  // Session 2: ghost prefill surfaces the prior set's values as input placeholders.
  await page.goto("/");
  await waitForBoot(page);
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await expect(page.getByTestId("set-0-weight")).toHaveAttribute("placeholder", "135");
  await expect(page.getByTestId("set-0-reps")).toHaveAttribute("placeholder", "5");
});
