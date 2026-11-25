// Independent verification of the 2026-11-25 boss UX batch (not CI).
//   VERIFY_TAG=before|after VERIFY_OUT=<dir> bun scripts/run-e2e.ts ux-verify-2026-11-25.spec.ts
// Runs identical steps on the pre-batch build (2e9cea3) and the combined
// workshop build. Steps are tolerant so the old build can still be measured;
// every measured fact is appended to <dir>/facts-<tag>.jsonl and every frame
// is saved as <dir>/<item>-<tag>[-variant].png. Pass/fail is judged from
// these files in docs/ux-audit/2026-11-25/PASS-FAIL.md.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

const TAG = process.env.VERIFY_TAG ?? "";
const OUT = process.env.VERIFY_OUT ?? "/tmp/ux-verify";
test.skip(!TAG, "verification capture only (VERIFY_TAG=before|after)");
test.setTimeout(120_000);
test.use({ viewport: { width: 390, height: 844 } });

function fact(item: string, key: string, value: unknown) {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(
    join(OUT, `facts-${TAG}.jsonl`),
    `${JSON.stringify({ item, key, value })}\n`,
  );
}

async function shot(page: Page, name: string, night = false) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(250);
  if (night) {
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-mode", "night"),
    );
    await page.waitForTimeout(150);
  }
  await page.screenshot({
    path: join(OUT, `${name}-${TAG}${night ? "-night" : ""}.png`),
  });
  if (night)
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-mode", "day"),
    );
}

async function attempt(item: string, label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    fact(item, `error:${label}`, (e as Error).message.split("\n")[0]);
  }
}

const vis = (page: Page, id: string) =>
  page
    .getByTestId(id)
    .first()
    .isVisible()
    .catch(() => false);

async function box(page: Page, id: string) {
  const el = page.getByTestId(id).first();
  if (!(await el.isVisible().catch(() => false))) return null;
  const b = await el.boundingBox();
  return (
    b && {
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.width),
      h: Math.round(b.height),
    }
  );
}

async function readVal(page: Page, id: string) {
  const el = page.getByTestId(id).first();
  if (!(await el.count())) return null;
  return el.evaluate((n) =>
    n instanceof HTMLInputElement ? n.value : (n.textContent ?? "").trim(),
  );
}

/** Testids of every visible ruler-ish element. */
/** The top-left clock: the session clock, or the rest stopwatch that
 * replaces it while resting. */
async function clockInfo(page: Page) {
  return page.evaluate(() => {
    const el = (document.querySelector('[data-testid="session-clock"]') ??
      document.querySelector(
        '[data-testid="rest-stopwatch"]',
      )) as HTMLElement | null;
    if (!el) return null;
    return {
      testid: el.getAttribute("data-testid"),
      text: el.innerText.replace(/\s+/g, " ").trim(),
      title: el.getAttribute("title"),
      kind: el.getAttribute("data-clock-kind"),
    };
  });
}

async function rulers(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-testid]")]
      .map((n) => n.getAttribute("data-testid") ?? "")
      .filter((t) => /-ruler$|^rir-option-/.test(t))
      .filter((t) => {
        const n = document.querySelector(`[data-testid="${t}"]`) as HTMLElement;
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }),
  );
}

async function newExercise(page: Page, label: string) {
  const name = `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
  return name;
}

async function start(page: Page, name: string) {
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${name}`).click();
  await expect(page.getByTestId("weight-field")).toBeVisible();
}

async function logBi(page: Page, w: string, r: string) {
  if (!(await vis(page, "weight-field")))
    await page.getByTestId("add-set").click();
  await page.getByTestId("weight-field").fill(w);
  await page.getByTestId("reps-field").fill(r);
  await page.getByTestId("log-set").click();
  await page.waitForTimeout(400);
}

async function openPerSide(page: Page) {
  const t = page.getByTestId("set-type-menu");
  await t.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await t.click({ force: true });
  await page.getByTestId("set-type-perside").click({ force: true });
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => {
    localStorage.setItem("unit", "kg");
    localStorage.setItem("mode", "day");
  });
  await signIn(page);
});

test("items 1, 2, 4, 5, 6, 10, 11, 15: bilateral entry", async ({ page }) => {
  const EX = await newExercise(page, "VfBi");
  await start(page, EX);

  // Item 2: first set of a never-logged exercise. Ruler offered?
  await attempt("2", "first-set", async () => {
    await page.getByTestId("weight-field").click();
    await page.waitForTimeout(200);
    fact("2", "rulers-first-set-weight", await rulers(page));
    await page.getByTestId("reps-field").click();
    await page.waitForTimeout(200);
    fact("2", "rulers-first-set-reps", await rulers(page));
    await shot(page, "2");
  });

  // Item 15: select-on-focus on the weight field (and reps).
  await attempt("15", "select", async () => {
    const w = page.getByTestId("weight-field");
    await w.fill("100");
    await w.evaluate((el) => (el as HTMLInputElement).blur());
    await w.tap();
    await page.waitForTimeout(250);
    fact(
      "15",
      "weight-selection-after-tap",
      await w.evaluate((el) => {
        const i = el as HTMLInputElement;
        return { value: i.value, start: i.selectionStart, end: i.selectionEnd };
      }),
    );
    fact(
      "15",
      "weight-focus-style",
      await w.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          bg: s.backgroundColor,
          shadow: s.boxShadow,
          caret: s.caretColor,
          outline: s.outlineStyle,
        };
      }),
    );
    await shot(page, "15");
    await shot(page, "15", true);
    await page.keyboard.type("80");
    fact("15", "weight-after-typing-80", await w.inputValue());
    await shot(page, "15-typed");
    // Second tap on an already-focused field should leave a caret (not reselect).
    await w.tap();
    await page.waitForTimeout(150);
    fact(
      "15",
      "weight-second-tap",
      await w.evaluate((el) => {
        const i = el as HTMLInputElement;
        return { start: i.selectionStart, end: i.selectionEnd };
      }),
    );
    const r = page.getByTestId("reps-field");
    await r.fill("12");
    await r.evaluate((el) => (el as HTMLInputElement).blur());
    await r.tap();
    await page.waitForTimeout(250);
    await page.keyboard.type("9");
    fact("15", "reps-12-tap-type-9", await r.inputValue());
  });

  // Log set 1 and open set 2.
  await page.getByTestId("weight-field").fill("60");
  await page.getByTestId("reps-field").fill("10");
  await page.getByTestId("log-set").click();
  await page.waitForTimeout(500);

  // Item 11: clock during rest.
  await attempt("11", "rest-clock", async () => {
    fact("11", "clock-rest", await clockInfo(page));
    await shot(page, "11-rest");
  });

  await page.getByTestId("add-set").first().click();
  await expect(page.getByTestId("log-set")).toBeVisible();

  await attempt("11", "set-clock", async () => {
    fact("11", "clock-set-open", await clockInfo(page));
  });

  // Item 2 again: second set, ruler now offered?
  await attempt("2", "second-set", async () => {
    await page.getByTestId("weight-field").click();
    await page.waitForTimeout(200);
    fact("2", "rulers-second-set-weight", await rulers(page));
    await shot(page, "2-second");
  });

  // Item 5: increment buttons on weight, reps, RIR rulers and their geometry.
  for (const k of ["weight", "reps", "rir"]) {
    await attempt("5", k, async () => {
      const field = k === "rir" ? "rir-column" : `${k}-field`;
      await page.getByTestId(field).click();
      await page.waitForTimeout(250);
      const minus = await box(page, `${k}-ruler-minus`);
      const plus = await box(page, `${k}-ruler-plus`);
      const ruler = await box(page, `${k}-ruler`);
      const wrap = await box(page, `${k}-ruler-wrap`);
      fact("5", `${k}-geometry`, { minus, plus, ruler, wrap });
      if (minus) {
        const before = await readVal(page, field);
        await page.getByTestId(`${k}-ruler-plus`).click();
        fact("5", `${k}-plus-click`, {
          before,
          after: await readVal(page, field),
        });
      }
      await shot(page, `5-${k}`);
    });
  }

  // Item 4: bilateral RIR affordance.
  await attempt("4", "rir", async () => {
    await page.getByTestId("rir-column").click();
    await page.waitForTimeout(250);
    fact("4", "rulers-on-rir", await rulers(page));
    fact(
      "4",
      "rir-column-tag",
      await page.getByTestId("rir-column").evaluate((n) => n.tagName),
    );
    await shot(page, "4");
  });

  // Item 1: reps then RIR then type; then reps again.
  await attempt("1", "rir-typing", async () => {
    await page.getByTestId("reps-field").fill("10");
    await page.getByTestId("reps-field").click();
    await page.getByTestId("rir-column").click();
    await page.keyboard.type("3");
    await page.waitForTimeout(200);
    fact("1", "after-rir-type-3", {
      reps: await readVal(page, "reps-field"),
      rir: await readVal(page, "rir-column"),
      rulers: await rulers(page),
      focused: await page.evaluate(() =>
        document.activeElement?.getAttribute("data-testid"),
      ),
    });
    await shot(page, "1-typed");
    await page.getByTestId("reps-field").click();
    await page.waitForTimeout(200);
    fact("1", "after-retap-reps", {
      rulers: await rulers(page),
      repsActive: await page
        .getByTestId("entry-col-reps")
        .getAttribute("data-active", { timeout: 1000 })
        .catch(() => null),
      rirActive: await page
        .getByTestId("entry-col-rir")
        .getAttribute("data-active", { timeout: 1000 })
        .catch(() => null),
      underline: await page.evaluate(() => {
        // Which column carries the accent underline: look for the widest
        // accent-coloured bar under the value row.
        const cols = ["reps-field", "rir-column"].map((t) => {
          const el = document.querySelector(`[data-testid="${t}"]`);
          const col =
            el?.closest("[data-active]") ?? el?.parentElement?.parentElement;
          return {
            t,
            active: col?.getAttribute("data-active", { timeout: 1000 }) ?? null,
          };
        });
        return cols;
      }),
    });
    await page.keyboard.type("8");
    fact("1", "after-retap-type-8", {
      reps: await readVal(page, "reps-field"),
      rir: await readVal(page, "rir-column"),
    });
    await shot(page, "1-retap");
  });

  // Item 6: top section + Now row attachment, day and night, 390 and 360.
  await attempt("6", "layout", async () => {
    await page.locator("body").click({ position: { x: 5, y: 120 } });
    const now = page.getByTestId("set-mark-1");
    fact("6", "now-row", await box(page, "set-mark-1"));
    fact("6", "entry-panel", await box(page, "entry-panel"));
    fact("6", "now-link", await box(page, "now-link"));
    fact("6", "exercise-progress", await readVal(page, "exercise-progress"));
    fact(
      "6",
      "now-row-style",
      await now
        .evaluate((n) => {
          const s = getComputedStyle(n);
          return {
            border: `${s.borderTopWidth} ${s.borderTopColor}`,
            outline: s.outlineStyle,
            shadow: s.boxShadow,
          };
        })
        .catch(() => null),
    );
    await shot(page, "6");
    await shot(page, "6", true);
    await page.setViewportSize({ width: 360, height: 640 });
    await shot(page, "6-360");
    await page.setViewportSize({ width: 390, height: 844 });
  });

  // Item 10: tap logged set 1 while set 2 is open.
  await attempt("10", "tap-set-1", async () => {
    await page.getByTestId("set-mark-0").click({ force: true });
    await page.waitForTimeout(300);
    fact("10", "set-mark-0", {
      selected: await page
        .getByTestId("set-mark-0")
        .getAttribute("data-selected", { timeout: 1000 }),
      ariaCurrent: await page
        .getByTestId("set-mark-0")
        .getAttribute("aria-current", { timeout: 1000 }),
      style: await page.getByTestId("set-mark-0").evaluate((n) => {
        const s = getComputedStyle(n);
        return `${s.borderTopWidth} ${s.borderTopColor} ${s.backgroundColor}`;
      }),
    });
    fact(
      "10",
      "set-mark-1-style",
      await page.getByTestId("set-mark-1").evaluate((n) => {
        const s = getComputedStyle(n);
        return `${s.borderTopWidth} ${s.borderTopColor} ${s.backgroundColor}`;
      }),
    );
    fact("10", "panel-weight", await readVal(page, "weight-field"));
    fact("10", "set-number", await readVal(page, "set-number"));
    await shot(page, "10");
  });

  // Item 7 (bilateral variant): log set 2 so every set is done.
  await attempt("7", "bilateral-done", async () => {
    await page.getByTestId("set-mark-1").click({ force: true });
    await page.waitForTimeout(200);
    if (await vis(page, "weight-field")) {
      await page.getByTestId("weight-field").fill("62.5");
      await page.getByTestId("reps-field").fill("8");
      await page.getByTestId("log-set").click();
      await page.waitForTimeout(600);
    }
    fact(
      "7",
      "bilateral-bottom-text",
      await page.evaluate(() => {
        const p =
          document.querySelector('[data-testid="session-panel"]') ??
          document.body;
        return (p as HTMLElement).innerText.slice(-300);
      }),
    );
    fact("7", "sets-done-summary", await readVal(page, "sets-done-summary"));
    await shot(page, "7-bilateral");
  });
});

test("item 12: hold the clock", async ({ page }) => {
  const EX = await newExercise(page, "VfClock");
  await start(page, EX);
  await page.waitForTimeout(1200);
  const clock = page.getByTestId("session-clock").first();
  const b = await clock.boundingBox();
  if (!b) return;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  // Touch hold through CDP (the device is a touch phone).
  await attempt("12", "touch-hold", async () => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: cx, y: cy }],
    });
    await page.waitForTimeout(900);
    fact(
      "12",
      "touch-hold-reveal-visible",
      await vis(page, "session-length-reveal"),
    );
    fact(
      "12",
      "touch-hold-reveal-text",
      await readVal(page, "session-length-reveal"),
    );
    await shot(page, "12");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(400);
    fact(
      "12",
      "after-release-reveal-visible",
      await vis(page, "session-length-reveal"),
    );
    fact(
      "12",
      "after-release-menu-open",
      await page.locator('[role="menu"],[role="dialog"]').count(),
    );
    await shot(page, "12-released");
  });
  // Mouse hold too.
  await attempt("12", "mouse-hold", async () => {
    await page.keyboard.press("Escape");
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(900);
    fact(
      "12",
      "mouse-hold-reveal-visible",
      await vis(page, "session-length-reveal"),
    );
    await page.mouse.up();
  });
  // During rest the clock is the rest stopwatch: does a hold reveal session length there?
  await attempt("12", "rest-hold", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await logBi(page, "40", "8");
    const c = page
      .getByTestId("session-clock")
      .or(page.getByTestId("rest-stopwatch"))
      .first();
    const rb = (await c.boundingBox({ timeout: 3000 }).catch(() => null)) ?? b;
    fact("12", "rest-clock", await clockInfo(page));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }],
    });
    await page.waitForTimeout(900);
    fact(
      "12",
      "rest-hold-reveal-visible",
      await vis(page, "session-length-reveal"),
    );
    fact(
      "12",
      "rest-hold-reveal-text",
      await readVal(page, "session-length-reveal"),
    );
    await shot(page, "12-rest");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(400);
    fact("12", "rest-after-release-clock", await clockInfo(page));
  });
});

test("items 3, 7, 8, 9: per-side entry", async ({ page }) => {
  const EX = await newExercise(page, "VfUni");
  await start(page, EX);
  await openPerSide(page);
  await page.getByTestId("weight-field").fill("30");
  await page.getByTestId("reps-field-left").fill("10");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.waitForTimeout(200);

  await attempt("3", "geometry", async () => {
    const g = {
      weight: await box(page, "weight-field"),
      repsL: await box(page, "reps-field-left"),
      rirL: await box(page, "rir-column-left"),
      repsR: await box(page, "reps-field-right"),
      rirR: await box(page, "rir-column-right"),
    };
    fact("3", "geometry-390", g);
    await shot(page, "3");
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(200);
    fact("3", "geometry-360", {
      weight: await box(page, "weight-field"),
      repsL: await box(page, "reps-field-left"),
      rirR: await box(page, "rir-column-right"),
      log: await box(page, "log-set"),
      overflowX: await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    });
    await shot(page, "3-360");
    await page.setViewportSize({ width: 390, height: 844 });
  });

  await attempt("9", "one-side", async () => {
    const log = page.getByTestId("log-set");
    fact("9", "log-one-side", {
      text: (await log.innerText()).trim(),
      ready: await log.getAttribute("data-ready", { timeout: 1000 }),
      disabled: await log.isDisabled(),
      bg: await log.evaluate((n) => getComputedStyle(n).backgroundColor),
    });
    await shot(page, "9");
    await shot(page, "9", true);
  });

  await page.getByTestId("reps-field-right").fill("8");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await attempt("9", "both-sides", async () => {
    const log = page.getByTestId("log-set");
    fact("9", "log-both-sides", {
      text: (await log.innerText()).trim(),
      ready: await log.getAttribute("data-ready", { timeout: 1000 }),
      bg: await log.evaluate((n) => getComputedStyle(n).backgroundColor),
    });
  });
  await page.getByTestId("log-set").click();
  await page.waitForTimeout(600);

  await attempt("8", "logged-pair", async () => {
    fact("8", "set-mark-0-html-text", await readVal(page, "set-mark-0"));
    fact(
      "8",
      "side-tags",
      await page.locator('[data-testid^="set-mark-0-side-tag"]').count(),
    );
    fact("8", "sides-box", await box(page, "set-mark-0-sides"));
    await shot(page, "8");
    await shot(page, "8", true);
  });

  await attempt("7", "all-logged", async () => {
    fact(
      "7",
      "perside-bottom-text",
      await page.evaluate(() => {
        const p =
          document.querySelector('[data-testid="session-panel"]') ??
          document.body;
        return (p as HTMLElement).innerText.slice(-300);
      }),
    );
    fact(
      "7",
      "sets-done-summary-visible",
      await vis(page, "sets-done-summary"),
    );
    await shot(page, "7");
  });
});

test("item 13: setup & form on a bilateral exercise", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId("pick-exercise-Leg Extension").click();
  await expect(page.getByTestId("weight-field")).toBeVisible();
  await attempt("13", "entry", async () => {
    fact("13", "setup-add-visible", await vis(page, "setup-add"));
    fact("13", "setup-row-visible", await vis(page, "setup-row"));
    await shot(page, "13");
  });
  await attempt("13", "presets", async () => {
    if (await vis(page, "setup-add"))
      await page.getByTestId("setup-add").click();
    else if (await vis(page, "setup-row"))
      await page.getByTestId("setup-row").click();
    await page.waitForTimeout(400);
    fact("13", "presets-visible", await vis(page, "setup-presets"));
    fact(
      "13",
      "setting-chips",
      await page.locator('[data-testid^="setup-setting-"]').allInnerTexts(),
    );
    fact(
      "13",
      "value-chips",
      (await page.locator('[data-testid^="setup-value-"]').allInnerTexts())
        .length,
    );
    await shot(page, "13-sheet");
    if (!(await vis(page, "setup-presets"))) return;
    await page.getByTestId("setup-setting-pad").click();
    await page.getByTestId("setup-value-5").click();
    await page.waitForTimeout(200);
    fact(
      "13",
      "note-after-pad-5",
      await page
        .getByTestId("setup-notes")
        .inputValue()
        .catch(() => null),
    );
    await shot(page, "13-picked");
    await page.getByTestId("setup-save").click();
    await page.waitForTimeout(500);
    fact("13", "row-after-save", await readVal(page, "setup-row"));
    await shot(page, "13-saved");
  });
});

test("item 14: reopening mid-session", async ({ page, context }) => {
  const A = await newExercise(page, "VfResA");
  const B = await newExercise(page, "VfResB");
  await start(page, A);
  await logBi(page, "50", "8");
  await page.getByTestId("session-menu").click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await expect(page.getByTestId("exercise-name")).toHaveText(B);
  await logBi(page, "20", "12");
  const url = page.url();
  // Route 1: Today → Resume.
  await attempt("14", "resume", async () => {
    await page.goto("/");
    await page.getByTestId("hero-resume-btn").click();
    await expect(page.getByTestId("exercise-name")).toBeVisible();
    await page.waitForTimeout(600);
    fact("14", "resume-lands-on", await readVal(page, "exercise-name"));
    await shot(page, "14");
  });
  // Route 2: a fresh tab (app relaunch) opening the session URL.
  await attempt("14", "fresh-tab", async () => {
    const p2 = await context.newPage();
    await p2.goto(url);
    await expect(p2.getByTestId("exercise-name")).toBeVisible();
    await p2.waitForTimeout(600);
    fact("14", "fresh-tab-lands-on", await readVal(p2, "exercise-name"));
    await p2.close();
  });
  // Route 3: hard reload.
  await attempt("14", "reload", async () => {
    await page.reload();
    await expect(page.getByTestId("exercise-name")).toBeVisible();
    await page.waitForTimeout(600);
    fact("14", "reload-lands-on", await readVal(page, "exercise-name"));
  });
  // Route 4: in progress on A again (go back to A, start typing, reopen).
  await attempt("14", "back-to-a", async () => {
    await page.getByTestId("exercise-prev").click({ force: true });
    await page.waitForTimeout(400);
    fact("14", "after-prev", await readVal(page, "exercise-name"));
    await page.goto("/");
    await page.getByTestId("hero-resume-btn").click();
    await expect(page.getByTestId("exercise-name")).toBeVisible();
    await page.waitForTimeout(600);
    fact(
      "14",
      "resume-after-prev-lands-on",
      await readVal(page, "exercise-name"),
    );
  });
  fact("14", "names", { A, B });
});

// ---- Motion (16, 17) ----------------------------------------------------

async function sampleOpacity(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const main = document.querySelector("main") as HTMLElement;
        const out: number[] = [];
        const t0 = performance.now();
        const tick = () => {
          out.push(Number(Number(getComputedStyle(main).opacity).toFixed(2)));
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else resolve(out);
        };
        tick();
      }),
    ms,
  );
}

async function sampleTop(page: Page, sel: string, ms: number) {
  return page.evaluate(
    ({ sel, ms }) =>
      new Promise<[number, number][]>((resolve) => {
        const out: [number, number][] = [];
        const t0 = performance.now();
        const tick = () => {
          const el = document.querySelector(sel);
          out.push([
            Math.round(performance.now() - t0),
            el ? Math.round(el.getBoundingClientRect().top) : -1,
          ]);
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else resolve(out);
        };
        tick();
      }),
    { sel, ms },
  );
}

/** Time (ms) at which a sampled series reaches its final value for good. */
function settleMs(s: [number, number][]) {
  const last = s[s.length - 1][1];
  let t = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (Math.abs(s[i][1] - last) > 0) {
      t = s[Math.min(i + 1, s.length - 1)][0];
      break;
    }
  }
  return t;
}

async function seedWeek(page: Page) {
  await page.evaluate(async () => {
    const sb = window.__frog.db;
    const uid = () => crypto.randomUUID();
    const now = Date.now();
    const ex = uid();
    await sb.from("exercises").insert({
      id: ex,
      created_at: now,
      updated_at: now,
      name: `Vf Bench ${now}`,
      is_custom: true,
      mechanic: "compound",
      muscle_targets: [{ muscle: "pecs", tier: "primary", role: "primary" }],
    });
    const t = now - 86_400_000;
    const sid = uid();
    await sb.from("sessions").insert({
      id: sid,
      created_at: t,
      updated_at: t,
      started_at: t,
      ended_at: t + 3_600_000,
    });
    const se = uid();
    await sb.from("session_exercises").insert({
      id: se,
      created_at: t,
      updated_at: t,
      session_id: sid,
      exercise_id: ex,
      order_index: 0,
    });
    for (let s = 0; s < 3; s++)
      await sb.from("set_logs").insert({
        id: uid(),
        created_at: t,
        updated_at: t,
        session_exercise_id: se,
        set_no: s,
        weight_kg: 60,
        reps: 8,
        rir_min: 2,
        rir_max: 2,
        completed: true,
      });
  });
}

async function motionPass(page: Page, label: string) {
  const tab = (n: string) => page.getByRole("link", { name: n }).last();
  // Route fade on a cache hit (Plan visited once, then back to Today).
  await tab("Plan").click();
  await page.waitForTimeout(1200);
  await tab("Today").click();
  const op = await sampleOpacity(page, 300);
  await page.waitForTimeout(800);
  await tab("Plan").click();
  await page.waitForTimeout(1000);
  await tab("Today").click();
  await page.screenshot({ path: join(OUT, `${label}-route-0ms-${TAG}.png`) });
  await page.waitForTimeout(40);
  await page.screenshot({ path: join(OUT, `${label}-route-60ms-${TAG}.png`) });
  fact(label, "route-fade-opacity-first-frames", op.slice(0, 8));
  fact(label, "route-fade-min-opacity", Math.min(...op));
  await page.waitForTimeout(800);
  // Meter replay on cache hit: running animations / width at frame 0.
  fact(
    label,
    "meter-animations-on-return",
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => (a as CSSAnimation).animationName === "meter-grow")
          .length,
    ),
  );
  await tab("Plan").click();
  await page.waitForTimeout(800);
  await tab("Today").click();
  const meters = await page.evaluate(() =>
    document
      .getAnimations()
      .map((a) => (a as CSSAnimation).animationName ?? "waapi")
      .filter(Boolean),
  );
  fact(label, "animations-at-today-return", meters);
  await page.waitForTimeout(800);
  // Tab pill: is the Today label covered mid-slide? Sample elementFromPoint.
  const todayLabel = page
    .getByRole("link", { name: "Today" })
    .last()
    .locator("span")
    .last();
  const lb = await todayLabel.boundingBox();
  await tab("Progress").click();
  await page.screenshot({
    path: join(OUT, `${label}-pill-0ms-${TAG}.png`),
    clip: { x: 0, y: 760, width: 390, height: 84 },
  });
  if (lb) {
    const covered = await page.evaluate(
      ({ x, y }) =>
        new Promise<string[]>((resolve) => {
          const out: string[] = [];
          const t0 = performance.now();
          const tick = () => {
            const el = document.elementFromPoint(x, y);
            out.push(
              el?.tagName === "SPAN" && el.textContent?.trim() === "Today"
                ? "label"
                : (el?.getAttribute("class") ?? el?.tagName ?? "?").slice(
                    0,
                    30,
                  ),
            );
            if (performance.now() - t0 < 300) requestAnimationFrame(tick);
            else resolve(out);
          };
          tick();
        }),
      { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 },
    );
    fact(label, "today-label-topmost-during-slide", covered.slice(0, 12));
  }
  // Pill travel frames.
  await page.waitForTimeout(800);
  await tab("Today").click();
  const pill = await sampleTop(page, "nav [class*='bg-accent-soft']", 0);
  void pill;
  const pillX = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        const t0 = performance.now();
        const tick = () => {
          const els = [
            ...document.querySelectorAll("span.absolute.inset-0"),
          ].filter((e) =>
            (e as HTMLElement).className.includes("bg-accent-soft"),
          );
          const el = els[els.length - 1];
          out.push(el ? Math.round(el.getBoundingClientRect().left) : -1);
          if (performance.now() - t0 < 400) requestAnimationFrame(tick);
          else resolve(out);
        };
        tick();
      }),
  );
  fact(label, "tab-pill-left-by-frame", pillX.slice(0, 20));
  await page.waitForTimeout(600);
  // Sheet settle tail.
  await tab("Progress").click();
  await page.waitForTimeout(800);
  await page.getByTestId("progress-seg-strength").click();
  await page.waitForTimeout(600);
  const about = page.getByRole("button", { name: "About strength" });
  if (await about.isVisible().catch(() => false)) {
    await about.click();
    const tops = await sampleTop(page, '[role="dialog"]', 700);
    fact(label, "sheet-settle-ms", settleMs(tops));
    fact(
      label,
      "sheet-top-series",
      tops.filter((_, i) => i % 3 === 0).slice(0, 15),
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  } else fact(label, "sheet", "About strength not found");
  await tab("Today").click();
  await page.waitForTimeout(800);
}

test("items 16, 17: motion", async ({ page }) => {
  await seedWeek(page);
  await page.goto("/");
  await expect(page.getByTestId("home-hero")).toBeVisible();
  await page.waitForTimeout(1500);
  await motionPass(page, "16");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(400);
  await motionPass(page, "17");
  // Reduced motion inside the session: logging flash / any animation.
  await page
    .getByTestId("start-session-btn")
    .click()
    .catch(() => {});
  await page.waitForTimeout(800);
  fact(
    "17",
    "session-running-animations",
    await page.evaluate(() =>
      document.getAnimations().map((a) => ({
        name: (a as CSSAnimation).animationName ?? "waapi",
        dur: (a.effect?.getTiming().duration as number) ?? 0,
      })),
    ),
  );
});

test("item 16b: meter replay on a cache-hit return to Today", async ({
  page,
}) => {
  await seedWeek(page);
  await page.goto("/");
  await expect(page.getByTestId("home-hero")).toBeVisible();
  await page.waitForTimeout(2500);
  const tab = (n: string) => page.getByRole("link", { name: n }).last();
  for (const round of [1, 2]) {
    await tab("Plan").click();
    await page.waitForTimeout(1200);
    await tab("Today").click();
    const series = await page.evaluate(
      () =>
        new Promise<{ n: number; widths: number[][]; grow: number }>(
          (resolve) => {
            const widths: number[][] = [];
            let grow = 0;
            const t0 = performance.now();
            const tick = () => {
              const fills = [
                ...document.querySelectorAll(
                  "span[aria-hidden='true'].absolute.inset-y-0.left-0",
                ),
              ] as HTMLElement[];
              widths.push(
                fills.map((f) => Math.round(f.getBoundingClientRect().width)),
              );
              grow = Math.max(
                grow,
                document.querySelectorAll(".meter-grow").length,
              );
              if (performance.now() - t0 < 500) requestAnimationFrame(tick);
              else resolve({ n: fills.length, widths, grow });
            };
            tick();
          },
        ),
    );
    fact("16", `meter-return-${round}`, {
      fills: series.n,
      meterGrowEls: series.grow,
      firstFrames: series.widths.slice(0, 6),
      last: series.widths[series.widths.length - 1],
    });
    if (round === 2) await shot(page, "16-meters");
  }
});
