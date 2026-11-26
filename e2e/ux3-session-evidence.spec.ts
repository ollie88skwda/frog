import { type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  addSet,
  finishSession,
  logSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Evidence capture for the boss's 2026-11-26 session notes
// (docs/ux-audit/2026-11-26/session). Same steps on the before and after
// builds: UX_SHOTS=before|after names the frames. Tolerant steps (no hard
// asserts); behaviour is asserted in session-ux3.spec.ts.

const SHOTS = "docs/ux-audit/2026-11-26/session";
const tag = process.env.UX_SHOTS;
const facts: Record<string, unknown> = {};

async function shot(page: Page, name: string, wait = 300) {
  if (wait) await page.waitForTimeout(wait);
  await page.screenshot({ path: `${SHOTS}/${name}-${tag}.png` });
}

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!tag, "evidence capture only (UX_SHOTS=before|after)");

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

test.afterAll(async () => {
  const { writeFileSync, readFileSync, existsSync } = await import("node:fs");
  const path = `${SHOTS}/facts-${tag}.json`;
  const prev = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  writeFileSync(path, `${JSON.stringify({ ...prev, ...facts }, null, 2)}\n`);
});

/** Samples the session panel's transform/opacity for ~260 ms after `act`. */
async function sampleSwitch(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __samples: string[] };
    w.__samples = [];
    const t0 = performance.now();
    const tick = () => {
      const name = document.querySelector('[data-testid="exercise-name"]');
      const host = document.querySelector('[data-testid="exercise-slide"]');
      const cs = host ? getComputedStyle(host) : null;
      w.__samples.push(
        `${Math.round(performance.now() - t0)}ms ${name?.textContent?.slice(0, 12)} t=${cs?.transform} o=${cs?.opacity}`,
      );
      if (performance.now() - t0 < 260) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await act();
  await page.waitForTimeout(80);
  await shot(page, "1-mid", 0);
  await page.waitForTimeout(300);
  return page.evaluate(
    () => (window as unknown as { __samples: string[] }).__samples,
  );
}

test("item 1: switching exercises (next button, swipe-equivalent prev)", async ({
  page,
}) => {
  const A = await makeExercise(page, "SlideA");
  const B = await makeExercise(page, "SlideB");
  await startSessionWith(page, A);
  await page.getByTestId("session-menu").click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await page.waitForTimeout(400);
  await shot(page, "1-start");
  facts["1-prev-samples"] = await sampleSwitch(page, () =>
    page.getByTestId("exercise-prev").click(),
  );
  await shot(page, "1-end");
  facts["1-settled-inline-style"] = await page
    .getByTestId("exercise-slide")
    .getAttribute("style");
});

test("item 2: ruler on set 1 (new exercise, and next session with last time)", async ({
  page,
}) => {
  const EX = await makeExercise(page, "Ruler3");
  await startSessionWith(page, EX);
  await page.getByTestId("weight-field").click();
  await page.getByTestId("weight-field").fill("50");
  facts["2-new-s1-typed-ruler"] = await page
    .getByTestId("weight-ruler")
    .count();
  await shot(page, "2-new-exercise-set1-typed");
  await page.getByTestId("reps-field").fill("10");
  await logSet(page);
  await addSet(page);
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await page.getByTestId("weight-field").click();
  facts["2-s2-perside-ruler"] = await page.getByTestId("weight-ruler").count();
  await shot(page, "2-set2-perside");
  await page.setViewportSize({ width: 390, height: 844 });
  await finishSession(page);
  await startSessionWith(page, EX);
  await page.getByTestId("weight-field").click();
  facts["2-next-session-s1-ghost"] = await page
    .getByTestId("weight-field")
    .getAttribute("data-ghost");
  facts["2-next-session-s1-ruler"] = await page
    .getByTestId("weight-ruler")
    .count();
  await shot(page, "2-next-session-set1");
});

test("items 3, 4: Setup & form sheet", async ({ page }) => {
  const EX = await makeExercise(page, "Setup3");
  await startSessionWith(page, EX);
  const add = page.getByTestId("setup-add");
  if (await add.isVisible().catch(() => false)) await add.click();
  else await page.getByTestId("setup-row").click();
  await page.waitForTimeout(400);
  facts["3-icons"] = await page.getByTestId("setup-setting-icon").count();
  facts["4-number-chips"] = await page
    .locator('[data-testid^="setup-value-"]')
    .evaluateAll(
      (els) =>
        els.filter((e) =>
          /^setup-value-\d+$/.test(e.getAttribute("data-testid") ?? ""),
        ).length,
    );
  await shot(page, "3-4-sheet");
  const pos = page.getByTestId("setup-position");
  if (await pos.isVisible().catch(() => false)) {
    await pos.click();
    await pos.fill("7");
    facts["4-inputmode"] = await pos.getAttribute("inputmode");
    facts["4-notes-after-typing"] = await page
      .getByTestId("setup-notes")
      .inputValue();
    await page.getByTestId("setup-position-plus").click();
    facts["4-notes-after-plus"] = await page
      .getByTestId("setup-notes")
      .inputValue();
    await shot(page, "4-typed");
  }
});
