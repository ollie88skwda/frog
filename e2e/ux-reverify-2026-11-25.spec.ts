// Independent re-verification of items 6 and 8 of the 2026-11-25 UX batch
// after fm/frog-ux-fix68 (not CI).
//   REVERIFY_OUT=<dir> bun scripts/run-e2e.ts ux-reverify-2026-11-25.spec.ts
// Saves full-page frames plus element boxes (CSS px) as JSON. Contrast is
// measured afterwards from the PNG pixels (docs/ux-audit/2026-11-25/reverify/
// measure.py), not from computed styles.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  addSet,
  logBilateralSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

const OUT = process.env.REVERIFY_OUT ?? "";
test.skip(!OUT, "re-verification capture only (REVERIFY_OUT=<dir>)");
test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => {
    localStorage.setItem("unit", "kg");
    localStorage.setItem("mode", "day");
  });
  await signIn(page);
});

async function mode(page: Page, m: "day" | "night") {
  await page.evaluate(
    (v) => document.documentElement.setAttribute("data-mode", v),
    m,
  );
  await page.waitForTimeout(600);
}

/** Geometry of the Now row, the last logged row and the entry panel. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const r = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
        x: Math.round(b.left),
        w: Math.round(b.width),
      };
    };
    const panel = document.querySelector('[data-testid="entry-panel"]');
    const marks = [
      ...document.querySelectorAll('[data-testid^="set-mark-"]'),
    ].filter((e) => /^set-mark-\d+$/.test(e.getAttribute("data-testid") ?? ""));
    const now =
      marks.find((e) => e.getAttribute("data-tab") === "true") ?? null;
    const listRows = marks.filter((e) => e !== now);
    const last = listRows[listRows.length - 1] ?? null;
    const pb = panel?.getBoundingClientRect();
    const lb = last?.getBoundingClientRect();
    const sc = document.querySelector('[data-testid="session-scroll"]');
    const title = document.querySelector('[data-testid="exercise-name"]');
    const kids = sc
      ? [...sc.children]
          .map((k) => k.getBoundingClientRect())
          .filter((b) => b.height > 0)
          .sort((a, b) => a.top - b.top)
      : [];
    let maxEmpty = 0;
    let prev = sc ? sc.getBoundingClientRect().top : 0;
    for (const b of kids) {
      maxEmpty = Math.max(maxEmpty, b.top - prev);
      prev = Math.max(prev, b.bottom);
    }
    return {
      scroll: sc && {
        ...r(sc),
        scrollTop: Math.round(sc.scrollTop),
        scrollHeight: sc.scrollHeight,
        clientHeight: sc.clientHeight,
      },
      panelContainsScroll: !!(panel && sc && panel.contains(sc)),
      titleBottom: r(title)?.bottom ?? null,
      maxEmptyInScrollPx: Math.round(maxEmpty),
      viewport: `${innerWidth}x${innerHeight}`,
      panel: r(panel),
      nowRow: r(now),
      nowRowInsidePanel: !!(panel && now && panel.contains(now)),
      lastLoggedRow: r(last),
      lastLoggedTestId: last?.getAttribute("data-testid") ?? null,
      gapLastRowToPanelPx: pb && lb ? Math.round(pb.top - lb.bottom) : null,
      progress:
        document
          .querySelector('[data-testid="exercise-progress"]')
          ?.textContent?.trim() ?? null,
    };
  });
}

/** CSS-px boxes of each side cell, its tag and the row it sits in. */
async function cellBoxes(page: Page, rootId: string) {
  return page.evaluate((id) => {
    const root = document.querySelector(`[data-testid="${id}"]`);
    if (!root) return null;
    const box = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    const row = root.closest("button") ?? root.parentElement;
    return {
      row: box(row),
      cells: [...root.querySelectorAll("[data-side-cell]")].map((c) => ({
        side: c.getAttribute("data-side-cell"),
        cell: box(c),
        tag: box(c.querySelector('[role="img"]') ?? c.firstElementChild),
      })),
    };
  }, rootId);
}

function save(name: string, data: unknown) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

for (const [w, h] of [
  [390, 844],
  [360, 640],
] as const)
  test(`item 6 re-verify ${w}x${h}`, async ({ page }) => {
    const m: Record<string, unknown> = {};
    await page.setViewportSize({ width: w, height: h });
    const EX = await makeExercise(page, "Rv6");
    await startSessionWith(page, EX);
    await logBilateralSet(page, "60", "10");
    await addSet(page);
    for (const md of ["day", "night"] as const) {
      await mode(page, md);
      m[`set2-${md}`] = await layout(page);
      await shot(page, `6-set2-${w}-${md}`);
    }
    await mode(page, "day");
    await logBilateralSet(page, "60", "9");
    await addSet(page);
    for (const md of ["day", "night"] as const) {
      await mode(page, md);
      m[`set3-${md}`] = await layout(page);
      await shot(page, `6-set3-${w}-${md}`);
    }
    await mode(page, "day");
    await openSetTypeMenu(page);
    await page.getByTestId("set-type-perside").click({ force: true });
    await page.waitForTimeout(300);
    for (const md of ["day", "night"] as const) {
      await mode(page, md);
      m[`perside-${md}`] = await layout(page);
      await shot(page, `6-perside-${w}-${md}`);
    }
    save(`6-layout-${w}`, m);
  });

for (const [w, h] of [
  [390, 844],
  [360, 640],
] as const)
  test(`item 8 re-verify ${w}x${h}`, async ({ page }) => {
    const m: Record<string, unknown> = {
      dpr: await page.evaluate(() => devicePixelRatio),
    };
    await page.setViewportSize({ width: w, height: h });
    const EX = await makeExercise(page, "Rv8");
    await startSessionWith(page, EX);
    await logBilateralSet(page, "40", "10");
    await addSet(page);
    await openSetTypeMenu(page);
    await page.getByTestId("set-type-perside").click({ force: true });
    await page.getByTestId("weight-field").fill("30");
    await page.getByTestId("reps-field-left").fill("10");
    await page.getByTestId("reps-field-right").fill("8");
    await page.getByTestId("log-set").click();
    await page.waitForTimeout(600);
    // Park the pointer off the rows so no hover tone is captured.
    await page.mouse.move(2, 2);
    await page
      .getByTestId("set-mark-1-sides")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    for (const md of ["day", "night"] as const) {
      await mode(page, md);
      m[`list-${md}`] = await cellBoxes(page, "set-mark-1-sides");
      m[`summary-${md}`] = await cellBoxes(page, "sets-done-1-sides");
      await shot(page, `8-${w}-${md}`);
    }
    m.dpr = await page.evaluate(() => devicePixelRatio);
    save(`8-boxes-${w}`, m);
  });
