import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  logBilateralSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Evidence capture for the 2026-11-25 session UX hand-fix
// (docs/ux-audit/2026-11-25/frog-ux-entry). Runs the same steps on the old
// and the new build: UX_SHOTS=before|after names the screenshots. Steps are
// tolerant (no hard asserts) so the old build can still be photographed;
// the behavioural checks live in session-ux-entry.spec.ts.

const SHOTS = "docs/ux-audit/2026-11-25/frog-ux-entry";
const tag = process.env.UX_SHOTS;

async function shot(page: Page, item: string, w = 390) {
  if (!tag) return;
  await page.waitForTimeout(250);
  await page.screenshot({
    path: `${SHOTS}/${item}-${tag}${w === 390 ? "" : `-${w}`}.png`,
  });
}

async function tryClick(page: Page, testId: string) {
  const el = page.getByTestId(testId).first();
  if (await el.isVisible().catch(() => false))
    await el.click({ force: true }).catch(() => {});
}

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!tag, "evidence capture only (UX_SHOTS=before|after)");

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

test("items 2, 4, 5, 6, 10, 11: first set, second set, tapped set", async ({
  page,
}) => {
  const EX = await makeExercise(page, "UxEv");
  await startSessionWith(page, EX);
  // 2: the first set of an exercise (nothing logged yet).
  await page.getByTestId("weight-field").click();
  await shot(page, "2");
  await logBilateralSet(page, "60", "10");
  await tryClick(page, "add-set");
  await expect(page.getByTestId("log-set")).toBeVisible();
  // 11: the clock while resting after a set.
  await shot(page, "11");
  // 4: RIR on a bilateral set.
  await tryClick(page, "rir-column");
  await shot(page, "4");
  // 5: increment controls on the weight and reps rulers.
  await tryClick(page, "weight-field");
  await page.keyboard.press("Escape");
  await shot(page, "5");
  await tryClick(page, "reps-field");
  await shot(page, "5b");
  // 6: the top section and the Now row while logging set 2.
  await shot(page, "6");
  // 10: tap the logged set 1 while set 2 is open.
  await tryClick(page, "set-mark-0");
  await shot(page, "10");
});

test("item 12: holding the clock", async ({ page }) => {
  const EX = await makeExercise(page, "UxClock");
  await startSessionWith(page, EX);
  const clock = page.getByTestId("session-clock");
  const box = await clock.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await shot(page, "12");
    await page.mouse.up();
  }
});

test("items 3, 8, 9: per-side entry, a logged pair, Log after one side", async ({
  page,
}) => {
  const EX = await makeExercise(page, "UxUni");
  await startSessionWith(page, EX);
  await openSetTypeMenu(page);
  await tryClick(page, "set-type-perside");
  await page.getByTestId("weight-field").fill("30");
  // 9: only the left side entered so far.
  await page.getByTestId("reps-field-left").fill("10");
  await page.getByTestId("reps-field-right").fill("");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await shot(page, "9");
  // 3: the per-side layout.
  await shot(page, "3");
  await page.getByTestId("reps-field-right").fill("8");
  await tryClick(page, "log-set");
  await page.waitForTimeout(400);
  // 8: the logged uneven pair in the set list.
  await shot(page, "8");
  // 7: all sets of the exercise logged.
  await shot(page, "7");
});

test("item 13: setup & form on a bilateral library exercise", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId("pick-exercise-Leg Extension").click();
  await expect(page.getByTestId("weight-field")).toBeVisible();
  await page.getByTestId("session-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await shot(page, "13");
  await tryClick(page, "setup-add");
  await tryClick(page, "setup-row");
  await page.waitForTimeout(300);
  await shot(page, "13b");
});

test("item 14: reopening the app mid-session", async ({ page }) => {
  const A = await makeExercise(page, "UxResA");
  const B = await makeExercise(page, "UxResB");
  await startSessionWith(page, A);
  await logBilateralSet(page, "50", "8");
  await page.getByTestId("session-menu").click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await expect(page.getByTestId("exercise-name")).toHaveText(B);
  await page.getByTestId("weight-field").fill("20");
  await page.getByTestId("reps-field").fill("12");
  await page.getByTestId("log-set").click();
  await tryClick(page, "add-set");
  await page.waitForTimeout(800);
  // Reopen: home, then Resume.
  await page.goto("/");
  await page.getByTestId("hero-resume-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await expect(page.getByTestId("exercise-name")).toBeVisible();
  await shot(page, "14");
});

test("360x640: entry and per-side fit", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const EX = await makeExercise(page, "UxSmall");
  await startSessionWith(page, EX);
  await logBilateralSet(page, "60", "10");
  await tryClick(page, "add-set");
  await tryClick(page, "reps-field");
  await shot(page, "fit-bilateral", 360);
  await openSetTypeMenu(page);
  await tryClick(page, "set-type-perside");
  await tryClick(page, "rir-column-right");
  await shot(page, "fit-perside", 360);
});
