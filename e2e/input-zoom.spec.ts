import {
  devices,
  expect,
  type Page,
  type TestInfo,
  test,
} from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Guards the iOS Safari input-zoom fix (theme.css, `@media (pointer: coarse)`).
// WebKit auto-zooms the page whenever a focused form control's *computed*
// font-size resolves under 16px; chromium never performs that zoom, so what a
// spec can hold is the input to it — the computed font-size on a coarse
// pointer — which is precisely what the fix changes. Real-device confirmation
// (tap an input on an iPhone, no zoom, keyboard still appears) stays a manual
// step. The sweep is deliberately every visible control on the screen rather
// than a named list: the rule is global, and a call site that lands a
// `text-sm`/`text-xs` class straight on its <input> is exactly how the previous
// bare-tag rule lost the cascade.

type Control = {
  tag: string;
  testid: string;
  className: string;
  fontSize: number;
};

async function formControls(page: Page): Promise<Control[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")]
      .filter((el) => el.getClientRects().length > 0)
      .filter(
        (el) =>
          !["file", "checkbox", "radio", "hidden"].includes(
            (el as HTMLInputElement).type,
          ),
      )
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute("data-testid") ?? "",
        className: el.className,
        fontSize: Number.parseFloat(getComputedStyle(el).fontSize),
      })),
  );
}

/** Screenshot into the run's output dir *and* attach it, so the frames survive
 * as files for a reviewer even when the run passes. */
async function shot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

/** Library -> new exercise sheet -> session with one exercise picked: the three
 * surfaces that carry a boxed TextField, a boxless logging `Field`, and the
 * picker's search box respectively. */
async function openLoggingRow(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${name}`).click();
  await expect(page.getByTestId("weight-field")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("touch pointer: every visible form control computes to >= 16px", async ({
  page,
}, testInfo) => {
  expect(
    await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
  ).toBe(true);

  const EX = `Zoom ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("new-exercise-btn").click();
  await expect(page.getByTestId("exercise-name-input")).toBeVisible();
  const sheet = await formControls(page);
  await shot(page, testInfo, "touch-new-exercise-sheet.png");

  await openLoggingRow(page, EX);
  await page.getByTestId("weight-field").fill("100");
  await page.getByTestId("reps-field").fill("5");
  const logging = await formControls(page);
  await shot(page, testInfo, "touch-logging-row.png");

  const all = [...sheet, ...logging];
  console.log(`[touch] ${JSON.stringify(all, null, 2)}`);
  expect(all.length).toBeGreaterThan(2);
  // The logging path specifically — the Spotlight weight/reps fields are the
  // surface that regressed before (a class-vs-tag specificity loss).
  expect(logging.some((c) => c.testid === "weight-field")).toBe(true);
  for (const c of all) {
    expect(
      c.fontSize,
      `${c.tag}[${c.testid || c.className}] must be >= 16px on touch`,
    ).toBeGreaterThanOrEqual(16);
  }
});

test("pinch-zoom stays enabled (no viewport-scale lockdown)", async ({
  page,
}) => {
  const content = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(content).toBeTruthy();
  expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
  expect(content).not.toMatch(/maximum-scale/i);
});

test.describe("mouse pointer (desktop) is untouched", () => {
  // `defaultBrowserType` is dropped from the device preset on purpose —
  // Playwright refuses it inside a describe (it would force a new worker), and
  // the config already pins chromium.
  const { defaultBrowserType: _chromium, ...desktop } =
    devices["Desktop Chrome"];
  test.use(desktop);

  test("logging row keeps its large Spotlight sizing on desktop (no coarse-pointer downscale)", async ({
    page,
  }, testInfo) => {
    // Pre-Spotlight this pinned an exact 15px (text-sm) value for the old
    // boxless logging field. The redesign (session-redesign-r3.html, "What
    // changed") deliberately jumped the weight/reps values to ~52px — this
    // now pins only the directional guarantee (desktop isn't downscaled to
    // the old size), not implementation's exact px.
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(false);

    await openLoggingRow(page, `Desk ${Date.now()}`);
    await page.getByTestId("weight-field").fill("100");
    const controls = await formControls(page);
    await shot(page, testInfo, "desktop-logging-row.png");
    console.log(`[desktop] ${JSON.stringify(controls, null, 2)}`);

    const weight = controls.find((c) => c.testid === "weight-field");
    expect(weight?.fontSize).toBeGreaterThanOrEqual(40);
  });
});
