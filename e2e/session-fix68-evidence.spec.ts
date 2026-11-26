import { writeFileSync } from "node:fs";
import { type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  addSet,
  logBilateralSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Evidence capture for the 2026-11-25 fix of items 6 and 8
// (docs/ux-audit/2026-11-25/fix-6-8). UX_SHOTS=before|after names the frames;
// each test also writes the measured geometry/colours as JSON next to them.
// Tolerant on purpose (the old build must still photograph); the behavioural
// asserts live in perside-entry.spec.ts / spotlight-marks.spec.ts.

const DIR = "docs/ux-audit/2026-11-25/fix-6-8";
const tag = process.env.UX_SHOTS;

test.skip(!tag, "evidence capture only (UX_SHOTS=before|after)");
test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

async function mode(page: Page, m: "day" | "night") {
  await page.evaluate(
    (v) => document.documentElement.setAttribute("data-mode", v),
    m,
  );
  // Let colour transitions settle before reading computed colours.
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}-${tag}.png` });
}

/** Gap between the bottom of the Now/selected row and the entry panel. */
async function gap(page: Page) {
  return page.evaluate(() => {
    const sel =
      document.querySelector(
        '[data-testid^="set-mark-"][data-selected="true"]',
      ) ?? document.querySelector('[data-testid="now-row"]');
    const panel = document.querySelector('[data-testid="entry-panel"]');
    if (!sel || !panel) return null;
    const a = sel.getBoundingClientRect();
    const b = panel.getBoundingClientRect();
    // Largest run of empty space in the scroll area above the panel: the
    // gap between consecutive visible blocks (header, extras, set band).
    const scroll = document.querySelector('[data-testid="session-scroll"]');
    let maxEmpty = 0;
    if (scroll) {
      const kids = [...scroll.children]
        .map((k) => k.getBoundingClientRect())
        .filter((r) => r.height > 0)
        .sort((x, y) => x.top - y.top);
      let prev = scroll.getBoundingClientRect().top;
      for (const r of kids) {
        maxEmpty = Math.max(maxEmpty, r.top - prev);
        prev = Math.max(prev, r.bottom);
      }
      maxEmpty = Math.max(
        maxEmpty,
        Math.min(b.top, scroll.getBoundingClientRect().bottom) - prev,
      );
    }
    return {
      maxEmptyAbovePanelPx: Math.round(maxEmpty),
      nowBottom: Math.round(a.bottom),
      panelTop: Math.round(b.top),
      gapPx: Math.round(b.top - a.bottom),
      viewport: `${innerWidth}x${innerHeight}`,
    };
  });
}

/** Resolved colours of the per-side chips and the surface behind them. */
async function chipColours(page: Page, rowId: string) {
  return page.evaluate((id) => {
    const toHex = (c: string) => {
      const m = c.match(/\d+(\.\d+)?/g);
      if (!m) return c;
      const [r, g, b] = m.map(Number);
      return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    };
    const bgOf = (el: Element | null): string => {
      let e: Element | null = el;
      while (e) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return toHex(c);
        e = e.parentElement;
      }
      return "#000000";
    };
    const root = document.querySelector(`[data-testid="${id}"]`);
    if (!root) return null;
    const chips = [
      ...root.querySelectorAll("[data-side-cell]"),
    ] as HTMLElement[];
    const fallback =
      chips.length === 0
        ? ([...root.children].filter((c) =>
            c.querySelector('[role="img"]'),
          ) as HTMLElement[])
        : chips;
    return fallback.map((c) => {
      const cs = getComputedStyle(c);
      const tag = c.querySelector('[role="img"]') as HTMLElement | null;
      const ts = tag ? getComputedStyle(tag) : null;
      return {
        chipBg: bgOf(c),
        rowBg: bgOf(c.parentElement?.closest("button") ?? c.parentElement),
        border:
          cs.borderTopWidth !== "0px"
            ? `${cs.borderTopWidth} ${toHex(cs.borderTopColor)}`
            : "none",
        tagBg: tag ? bgOf(tag) : null,
        tagText: ts ? toHex(ts.color) : null,
        tagFont: ts?.fontSize ?? null,
        valueText: toHex(cs.color),
      };
    });
  }, rowId);
}

function save(name: string, data: unknown) {
  writeFileSync(`${DIR}/${name}-${tag}.json`, JSON.stringify(data, null, 2));
}

for (const [w, h] of [
  [390, 844],
  [360, 640],
] as const)
  test(`item 6: Now row and entry panel ${w}x${h}`, async ({ page }) => {
    const m: Record<string, unknown> = {};
    await page.setViewportSize({ width: w, height: h });
    const EX = await makeExercise(page, "Fx6");
    await startSessionWith(page, EX);
    await logBilateralSet(page, "60", "10");
    await addSet(page);
    for (const md of ["day", "night"] as const) {
      await mode(page, md);
      m[`set2of2-${md}`] = await gap(page);
      await shot(page, `6-set2of2-${w}-${md}`);
    }
    await mode(page, "day");
    // Set 3 of 3.
    await logBilateralSet(page, "60", "9");
    await addSet(page);
    m["set3of3-day"] = await gap(page);
    await shot(page, `6-set3of3-${w}-day`);
    // Per-side entry open (taller panel).
    await openSetTypeMenu(page);
    await page.getByTestId("set-type-perside").click({ force: true });
    await page.waitForTimeout(300);
    for (const md of ["day", "night"] as const) {
      await mode(page, md);
      m[`perside-${md}`] = await gap(page);
      await shot(page, `6-perside-${w}-${md}`);
    }
    save(`6-measure-${w}`, m);
  });

test("item 8: per-side chips in the set list and summary", async ({ page }) => {
  const m: Record<string, unknown> = {};
  await page.setViewportSize({ width: 390, height: 844 });
  const EX = await makeExercise(page, "Fx8");
  await startSessionWith(page, EX);
  await logBilateralSet(page, "40", "10");
  await addSet(page);
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click({ force: true });
  await page.getByTestId("weight-field").fill("30");
  await page.getByTestId("reps-field-left").fill("10");
  await page.getByTestId("reps-field-right").fill("8");
  await page.getByTestId("log-set").click();
  await page.waitForTimeout(500);
  for (const md of ["day", "night"] as const) {
    await mode(page, md);
    m[`list-${md}`] = await chipColours(page, "set-mark-1-sides");
    m[`summary-${md}`] = await chipColours(page, "sets-done-1");
    await shot(page, `8-${md}`);
  }
  save("8-measure", m);
});
