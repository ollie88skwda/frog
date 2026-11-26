import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  finishSession,
  logBilateralSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Evidence capture for the boss's second session UX round (2026-11-25 r2,
// docs/ux-audit/2026-11-25-r2/session). Same steps on the before and after
// builds: UX_SHOTS=before|after names the frames. Steps are tolerant (no
// hard asserts) so the old build can still be photographed; behaviour is
// asserted in session-ux2.spec.ts.

const SHOTS = "docs/ux-audit/2026-11-25-r2/session";
const tag = process.env.UX_SHOTS;
const facts: Record<string, unknown> = {};

async function shot(page: Page, name: string) {
  if (!tag) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}-${tag}.png` });
}

async function tryClick(page: Page, testId: string) {
  const el = page.getByTestId(testId).first();
  if (await el.isVisible().catch(() => false))
    await el.click({ force: true }).catch(() => {});
}

async function box(page: Page, testId: string) {
  const el = page.getByTestId(testId).first();
  if (!(await el.count())) return null;
  return el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      cx: Math.round(r.x + r.width / 2),
    };
  });
}

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!tag, "evidence capture only (UX_SHOTS=before|after)");

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

test.afterAll(async () => {
  if (!tag) return;
  const { writeFileSync, readFileSync, existsSync } = await import("node:fs");
  const path = `${SHOTS}/facts-${tag}.json`;
  const prev = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  writeFileSync(path, `${JSON.stringify({ ...prev, ...facts }, null, 2)}\n`);
});

test("items 1, 4, 5, 6: logged set, note button, tap a field, ruler", async ({
  page,
}) => {
  const EX = await makeExercise(page, "Ux2");
  await startSessionWith(page, EX);
  // 5: tap a field that already holds a value.
  const w = page.getByTestId("weight-field");
  await w.fill("100");
  await w.evaluate((el) => (el as HTMLInputElement).blur());
  await w.tap();
  await page.waitForTimeout(200);
  facts["5-selection"] = await w.evaluate((el) => {
    const i = el as HTMLInputElement;
    return { value: i.value, start: i.selectionStart, end: i.selectionEnd };
  });
  await shot(page, "5");
  await page.getByTestId("reps-field").fill("8");
  await page.getByTestId("log-set").click();
  await page.waitForTimeout(400);
  // 1: one set logged, no open set.
  facts["1-logged-label"] = await box(page, "sets-done-label");
  await shot(page, "1");
  // 6: open set 2 and tap weight: the ruler should be on screen.
  await tryClick(page, "add-set-panel");
  await tryClick(page, "weight-field");
  await page.waitForTimeout(300);
  const ruler = page.getByTestId("weight-ruler");
  facts["6-ruler"] = {
    count: await ruler.count(),
    inViewport: (await ruler.count())
      ? await ruler.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0;
        })
      : false,
    box: await box(page, "weight-ruler"),
    panel: await box(page, "entry-panel"),
  };
  await shot(page, "6");
  // 4: the set note button.
  facts["4-note-btn"] = await box(page, "set-1-more");
  await shot(page, "4");
  await tryClick(page, "set-1-more");
  await shot(page, "4-sheet");
});

test("item 3: per-side weight centring", async ({ page }) => {
  const EX = await makeExercise(page, "Ux2Uni");
  await startSessionWith(page, EX);
  await openSetTypeMenu(page);
  await tryClick(page, "set-type-perside");
  await page.getByTestId("weight-field").fill("30");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  const weightBox = await box(page, "weight-field");
  const panelBox = await box(page, "entry-panel");
  facts["3-weight"] = {
    weightCx: weightBox?.cx,
    panelCx: panelBox?.cx,
    offset: weightBox && panelBox ? Math.abs(weightBox.cx - panelBox.cx) : null,
  };
  await shot(page, "3");
});

test("items 2, 7: setup sheet and exercise menu", async ({ page }) => {
  const EX = await makeExercise(page, "Ux2Menu");
  await startSessionWith(page, EX);
  await page.getByTestId(`block-${EX}-menu`).click();
  await page.waitForTimeout(200);
  facts["7-unit-in-menu"] =
    (await page.getByTestId(`block-${EX}-unit-kg`).count()) > 0;
  await shot(page, "7");
  await page.keyboard.press("Escape");
  await page.getByTestId("session-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await tryClick(page, "setup-add");
  await page.waitForTimeout(300);
  await shot(page, "2");
});

test("items 8, 9: routine session changes and last time", async ({ page }) => {
  const A = await makeExercise(page, "Ux2RA");
  const B = await makeExercise(page, "Ux2RB");
  const ROUTINE = `Ux2 routine ${Date.now()}`;
  await page.goto("/routines");
  await page.getByTestId("new-routine-btn").click();
  await page.getByTestId("routine-name-input").fill(ROUTINE);
  for (const ex of [A, B]) {
    await page.getByTestId("routine-add-exercise-btn").click();
    await page.getByTestId(`routine-pick-${ex}`).click();
  }
  await page.getByTestId("routine-save-btn").click();
  await expect(page).toHaveURL(/\/plan\?s=routines$/);

  // Session 1: log A once so session 2 has a last time.
  await page.getByTestId(`routine-start-${ROUTINE}`).click();
  await expect(page).toHaveURL(/\/session\//);
  await logBilateralSet(page, "40", "10");
  await finishSession(page);

  // Session 2: last time shows on set 1 of A.
  await page.goto("/plan?s=routines");
  await page.getByTestId(`routine-start-${ROUTINE}`).click();
  await expect(page).toHaveURL(/\/session\//);
  await expect(page.getByTestId("weight-field")).toBeVisible();
  await page.waitForTimeout(500);
  facts["9-fields"] = {
    ghostColor: await page
      .getByTestId("weight-field-ghost")
      .evaluate((el) => getComputedStyle(el).color)
      .catch(() => null),
    weight: await page.getByTestId("weight-field").inputValue(),
    reps: await page.getByTestId("reps-field").inputValue(),
    weightGhost: await page
      .getByTestId("weight-field")
      .getAttribute("placeholder"),
    lastLine: await page
      .getByTestId("now-tab")
      .innerText()
      .catch(() => null),
  };
  await shot(page, "9");

  // 8: switch A to per side, log, then finish.
  await page.getByTestId("laterality-perside").click();
  await page.getByTestId("weight-field").fill("40");
  await page.getByTestId("reps-field-left").fill("10");
  await page.getByTestId("reps-field-right").fill("10");
  await page.getByTestId("log-set").click();
  await page.waitForTimeout(400);
  await page.getByTestId("session-menu").click();
  await page.getByTestId("session-finish").click();
  await page.waitForTimeout(400);
  facts["8-template-prompt"] =
    (await page.getByTestId("finish-template-changes").count()) > 0;
  await shot(page, "8");
});

// Layout sweep: the changed controls at both phone sizes in day and night,
// none clipped horizontally or off the bottom.
for (const [w, h] of [
  [360, 640],
  [390, 844],
] as const)
  for (const mode of ["day", "night"] as const)
    test(`sweep ${w}x${h} ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const EX = await makeExercise(page, "Ux2Sweep");
      await startSessionWith(page, EX);
      await page.evaluate(
        (m) => document.documentElement.setAttribute("data-mode", m),
        mode,
      );
      await page.getByTestId("weight-field").fill("30");
      await page.getByTestId("reps-field").fill("8");
      await page.getByTestId("log-set").click();
      await page.getByTestId("add-set").click();
      await openSetTypeMenu(page);
      await page.getByTestId("set-type-perside").click();
      await page.getByTestId("weight-field").click();
      const clipped = await page.evaluate(() =>
        [
          "weight-field",
          "weight-split-toggle",
          "set-1-more",
          "set-type-menu",
          "weight-ruler",
          "log-set",
        ].filter((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) return true;
          const r = el.getBoundingClientRect();
          return (
            r.left < 0 ||
            r.right > innerWidth ||
            r.bottom > innerHeight ||
            r.width === 0
          );
        }),
      );
      facts[`sweep-${w}x${h}-${mode}`] = clipped;
      await page.screenshot({ path: `${SHOTS}/sweep-${w}x${h}-${mode}.png` });
      expect(clipped).toEqual([]);
    });
