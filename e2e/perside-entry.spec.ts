import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  finishSession,
  makeExercise,
  openRulerSet,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Per-side (unilateral) entry, option E2: one mirrored row
// `L Reps · RIR | Weight | RIR · Reps R`, both sides always visible, one
// ruler for whichever value is underlined (RIR 0 to 5+ included), and a
// labelled Both sides / Per side switch on the entry panel.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

/** Selects a value, then drives the one ruler with the keyboard. */
async function ruler(
  page: Page,
  field: string,
  rulerId: string,
  keys: string[],
) {
  await page.getByTestId(field).click();
  await page.getByTestId(rulerId).focus();
  for (const k of keys) await page.keyboard.press(k);
}

function readPair(page: Page, name: string) {
  return page.evaluate(async (exerciseName) => {
    const sb = window.__frog.db;
    const { data: ex } = await sb
      .from("exercises")
      .select("id")
      .eq("name", exerciseName)
      .single();
    const { data: ses } = await sb
      .from("session_exercises")
      .select("id")
      .eq("exercise_id", (ex as { id: string }).id);
    const out: {
      set_no: number;
      side: string | null;
      weight_kg: number | null;
      reps: number | null;
      rir_min: number | null;
      rir_max: number | null;
    }[] = [];
    for (const se of (ses ?? []) as { id: string }[]) {
      const { data } = await sb
        .from("set_logs")
        .select("set_no, side, weight_kg, reps, rir_min, rir_max")
        .eq("session_exercise_id", se.id)
        .is("deleted_at", null);
      out.push(...((data ?? []) as typeof out));
    }
    return out.sort((a, b) => (a.side ?? "").localeCompare(b.side ?? ""));
  }, name);
}

test("per-side shows both sides, one ruler edits each value, both sides are stored and shown", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideE2");
  await startSessionWith(page, EX);
  // The ruler shows from the second set on (2026-11-25).
  await openRulerSet(page);

  // A bilateral exercise opts in from the ⋯ menu; from then on the panel
  // carries the labelled switch.
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await expect(page.getByTestId("laterality-perside")).toHaveAttribute(
    "data-state",
    "on",
  );
  await expect(page.getByTestId("laterality-help")).toContainText(
    "own reps and RIR",
  );

  // Both sides at once, no side tabs, no RIR chips, no steppers.
  const row = page.getByTestId("perside-row");
  await expect(row).toBeVisible();
  for (const id of [
    "reps-field-left",
    "rir-column-left",
    "weight-field",
    "rir-column-right",
    "reps-field-right",
  ])
    await expect(row.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId("side-tabs")).toHaveCount(0);
  await expect(page.locator("[data-testid^=rir-option-]")).toHaveCount(0);
  await expect(page.locator("[data-testid$=-step-minus]")).toHaveCount(0);
  // RIR never prefills: empty on both sides.
  await expect(page.getByTestId("rir-column-left")).toHaveValue("");
  await expect(page.getByTestId("rir-column-right")).toHaveValue("");

  // Shared weight, typed; reps and RIR per side through the one ruler.
  await page.getByTestId("weight-field").fill("30");
  await page.getByTestId("reps-field-left").fill("10");
  await ruler(page, "reps-field-right", "reps-ruler", [
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
  ]);
  await expect(page.getByTestId("reps-field-right")).toHaveValue("8");
  await expect(page.getByTestId("reps-field-left")).toHaveValue("10");

  // RIR ruler runs 0 to 5+, starts at the default 2 once touched.
  await ruler(page, "rir-column-left", "rir-ruler", ["ArrowLeft"]);
  await expect(page.getByTestId("rir-column-left")).toHaveValue("1");
  await ruler(page, "rir-column-right", "rir-ruler", [
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
  ]);
  await expect(page.getByTestId("rir-column-right")).toHaveValue("5+");
  await expect(page.getByTestId("rir-ruler")).toHaveAttribute(
    "aria-valuemax",
    "5",
  );

  await page.getByTestId("log-set").click();
  await expect.poll(() => readPair(page, EX)).toHaveLength(3);
  const rows = (await readPair(page, EX)).filter((r) => r.side != null);
  expect(
    rows.map((r) => [
      r.side,
      r.set_no,
      r.weight_kg,
      r.reps,
      r.rir_min,
      r.rir_max,
    ]),
  ).toEqual([
    ["left", 1, 30, 10, 1, 1],
    ["right", 1, 30, 8, 5, null],
  ]);

  // The logged row shows both sides.
  const sides = page.getByTestId("set-mark-1-sides");
  await expect(sides).toContainText(/30 × 10/);
  await expect(sides).toContainText(/30 × 8/);

  // Editing the pair opens on the side that was tapped.
  const box = await page.getByTestId("set-mark-1").boundingBox();
  const r = await sides.locator("[data-pair-right]").boundingBox();
  if (!box || !r) throw new Error("set row not laid out");
  await page.mouse.click(r.x + r.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("reps-ruler")).toHaveAttribute(
    "aria-label",
    "Right reps ruler",
  );
  await expect(page.getByTestId("reps-field-right")).toHaveValue("8");

  // Next session: last time's reps are per-side grey ghosts in the fields
  // (boss r2 note 9), not prefilled values; RIR stays blank.
  // Set 2 is the pair (set 1 was the throwaway that unlocks the ruler).
  await finishSession(page);
  await startSessionWith(page, EX);
  await openRulerSet(page);
  // The exercise itself is still bilateral, so per-side is opted into again.
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await expect(page.getByTestId("reps-field-left")).toHaveValue("");
  await expect(page.getByTestId("reps-field-left")).toHaveAttribute(
    "placeholder",
    "10",
  );
  await expect(page.getByTestId("reps-field-right")).toHaveAttribute(
    "placeholder",
    "8",
  );
  await expect(page.getByTestId("rir-column-left")).toHaveValue("");
});

test("validation names the side that's missing reps and selects it", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideE2Valid");
  await startSessionWith(page, EX);
  await openRulerSet(page);
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();

  await page.getByTestId("weight-field").fill("20");
  await page.getByTestId("reps-field-left").fill("8");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("reps-error")).toContainText("right");
  await expect(page.getByTestId("reps-ruler")).toHaveAttribute(
    "aria-label",
    "Right reps ruler",
  );
  await page.getByTestId("reps-field-right").fill("7");
  await expect(page.getByTestId("reps-error")).toHaveCount(0);

  // Missing weight on one side once the weight is split.
  await page.getByTestId("weight-field").click();
  await page.getByTestId("weight-split-toggle").click();
  await page.getByTestId("weight-field-right").fill("");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("weight-error")).toBeVisible();
  await expect(page.getByTestId("weight-ruler")).toHaveAttribute(
    "aria-label",
    "Right weight ruler",
  );
});

test("the switch flips between both sides and per side with one helper line", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideE2Switch");
  await startSessionWith(page, EX);
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();

  await page.getByTestId("laterality-both").click();
  await expect(page.getByTestId("perside-row")).toHaveCount(0);
  await expect(page.getByTestId("reps-field")).toBeVisible();
  await expect(page.getByTestId("laterality-help")).toContainText(
    "same for left and right",
  );
  await page.getByTestId("laterality-perside").click();
  await expect(page.getByTestId("perside-row")).toBeVisible();
});

for (const [w, h] of [
  [390, 844],
  [360, 640],
] as const)
  for (const mode of ["day", "night"] as const)
    test(`per-side row fits ${w}x${h} ${mode}: no overflow, 44px targets`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      const EX = await makeExercise(page, "PerSideE2Fit");
      await startSessionWith(page, EX);
      await openRulerSet(page);
      await openSetTypeMenu(page);
      await page.getByTestId("set-type-perside").click();
      await page.evaluate(
        (m) => document.documentElement.setAttribute("data-mode", m),
        mode,
      );
      await page.getByTestId("weight-field").fill("102.5");
      await page.getByTestId("reps-field-left").fill("12");
      await page.getByTestId("reps-field-right").fill("10");
      await ruler(page, "rir-column-right", "rir-ruler", ["ArrowRight"]);

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      for (const id of [
        "reps-field-left",
        "rir-column-left",
        "weight-field",
        "rir-column-right",
        "reps-field-right",
        "laterality-both",
        "laterality-perside",
      ]) {
        const b = await page.getByTestId(id).boundingBox();
        expect(b, id).not.toBeNull();
        expect(b?.height ?? 0, id).toBeGreaterThanOrEqual(40);
        expect((b?.x ?? 0) + (b?.width ?? 0), id).toBeLessThanOrEqual(w);
      }
      for (const id of ["laterality-both", "laterality-perside"]) {
        const b = await page.getByTestId(id).boundingBox();
        expect(b?.height ?? 0, id).toBeGreaterThanOrEqual(44);
      }
      // RIR reads as its own value, not clipped.
      await expect(page.getByTestId("rir-column-right")).toHaveValue("3");
      await expect(page.getByTestId("log-set")).toBeInViewport();

      // Split weight keeps 44px targets and the Log button on screen.
      await page.getByTestId("weight-field").click();
      await page.getByTestId("weight-split-toggle").click();
      await page.getByTestId("weight-field-right").fill("100");
      for (const id of ["weight-field", "weight-field-right"]) {
        const b = await page.getByTestId(id).locator("xpath=..").boundingBox();
        expect(b?.height ?? 0, id).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByTestId("log-set")).toBeInViewport();
      await page.getByTestId("log-set").click();
      // The logged uneven pair fits the row: both sides' text is readable.
      const sides = page.getByTestId("set-mark-1-sides");
      await expect(sides).toContainText("102.5 × 12");
      await expect(sides).toContainText("100 × 10");
      const clipped = await sides.evaluate(
        (el) => el.scrollWidth > el.clientWidth + 1,
      );
      expect(clipped).toBe(false);
    });

/** Item 6 follow-up: the last logged set row must sit fully inside the
 * scroll area's visible box, above the entry panel, and the Now row (the
 * panel's top band) must be fully on screen. */
async function listInView(page: Page, lastIndex: number) {
  return page.evaluate((i) => {
    const q = (id: string) =>
      document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const scroll = q("session-scroll");
    const panel = q("entry-panel");
    const last = q(`set-mark-${i}`);
    const now = q("now-tab");
    if (!scroll || !panel || !last || !now) return { missing: true };
    const s = scroll.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const l = last.getBoundingClientRect();
    const n = now.getBoundingClientRect();
    const floor = Math.min(s.bottom, p.top, innerHeight);
    return {
      missing: false,
      lastTopClip: Math.round(s.top - l.top),
      lastBottomClip: Math.round(l.bottom - floor),
      nowTopClip: Math.round(-n.top),
      nowBottomClip: Math.round(n.bottom - innerHeight),
    };
  }, lastIndex);
}

async function expectListInView(page: Page, lastIndex: number, what: string) {
  // Let any resize-driven scroll settle.
  await page.waitForTimeout(250);
  // UX_SHOTS=before|after saves the frame (docs/ux-audit/2026-11-25/fix-6-scroll).
  const tag = process.env.UX_SHOTS;
  if (tag) {
    const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
    const mode = await page.evaluate(() =>
      document.documentElement.getAttribute("data-mode"),
    );
    await page.screenshot({
      path: `docs/ux-audit/2026-11-25/fix-6-scroll/${width}x${height}-${mode}-${what.replace(/\W+/g, "-")}-${tag}.png`,
    });
  }
  const r = await listInView(page, lastIndex);
  expect(r.missing, `${what}: rows present`).toBe(false);
  expect(r.lastTopClip ?? 0, `${what}: last set top`).toBeLessThanOrEqual(1);
  expect(
    r.lastBottomClip ?? 0,
    `${what}: last set under panel`,
  ).toBeLessThanOrEqual(1);
  expect(r.nowTopClip ?? 0, `${what}: Now row top`).toBeLessThanOrEqual(1);
  expect(r.nowBottomClip ?? 0, `${what}: Now row bottom`).toBeLessThanOrEqual(
    1,
  );
}

for (const [w, h] of [
  [360, 640],
  [390, 844],
] as const)
  for (const mode of ["day", "night"] as const)
    test(`set list keeps the Now row and last set in view ${w}x${h} ${mode}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      const EX = await makeExercise(page, "ListInView");
      await startSessionWith(page, EX);
      await page.evaluate(
        (m) => document.documentElement.setAttribute("data-mode", m),
        mode,
      );
      // Sets 1-3, bilateral.
      for (let i = 0; i < 3; i++) {
        await page.getByTestId("weight-field").fill("60");
        await page.getByTestId("reps-field").fill(String(10 - i));
        await page.getByTestId("log-set").click();
        await expect(page.getByTestId(`set-mark-${i}`)).toBeVisible();
        await page.getByTestId("add-set").click();
        await expect(page.getByTestId("log-set")).toBeVisible();
        await expectListInView(page, i, `bilateral set ${i + 2}`);
      }
      // Per-side: the taller panel.
      await openSetTypeMenu(page);
      await page.getByTestId("set-type-perside").click();
      await expect(page.getByTestId("perside-row")).toBeVisible();
      await expectListInView(page, 2, "per-side open");
      // Keyboard up on a phone: the visual viewport shrinks.
      await page.getByTestId("weight-field").click();
      await page.setViewportSize({ width: w, height: Math.round(h * 0.62) });
      await expectListInView(page, 2, "keyboard up");
      await page.setViewportSize({ width: w, height: h });
      // The column follows visualViewport, whose resize can land a frame
      // late: let it grow back before scrolling the list.
      await expect
        .poll(() =>
          page
            .getByTestId("session-column")
            .evaluate((el) => Math.round(el.getBoundingClientRect().bottom)),
        )
        .toBe(h);
      // Reading older sets still scrolls: the list is not locked.
      const top = await page.getByTestId("session-scroll").evaluate((el) => {
        el.scrollTop = 0;
        return el.scrollTop;
      });
      expect(top).toBe(0);
      await expect(page.getByTestId("exercise-name")).toBeInViewport();
    });

// The done panel's "Next: <exercise>" button: a long name truncates to one
// line with an ellipsis and the chevron stays visible (no overflow).
for (const w of [390, 360] as const)
  for (const mode of ["day", "night"] as const)
    test(`Next button truncates a long exercise name at ${w}px ${mode}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: 844 });
      const A = await makeExercise(page, "NextFitA");
      const B = await makeExercise(
        page,
        "Incline Dumbbell Bench Press Long Name (55 Degrees)",
      );
      await startSessionWith(page, A);
      await page.getByTestId("session-menu").click();
      await page.getByTestId("open-exercise-picker").click();
      await page.getByTestId(`pick-exercise-${B}`).click();
      await expect(page.getByTestId("exercise-name")).toContainText(B);
      await page.getByTestId("exercise-prev").click();
      await expect(page.getByTestId("exercise-name")).toContainText(A);
      await page.getByTestId("weight-field").fill("60");
      await page.getByTestId("reps-field").fill("10");
      await page.getByTestId("log-set").click();
      // Logging the last set moves on to the next exercise; come back to
      // the finished one, whose done panel carries the Next button.
      await expect(page.getByTestId("exercise-name")).toContainText(B);
      await page.getByTestId("exercise-prev").click();
      await expect(page.getByTestId("exercise-name")).toContainText(A);
      const next = page.getByTestId("next-exercise");
      await expect(next).toBeVisible();
      await page.evaluate(
        (m) => document.documentElement.setAttribute("data-mode", m),
        mode,
      );
      await page.waitForTimeout(250);
      const tag = process.env.UX_SHOTS;
      if (tag)
        await page.screenshot({
          path: `docs/ux-audit/2026-11-25/fix-6-scroll/next-${w}-${mode}-${tag}.png`,
        });
      const m = await next.evaluate((el) => {
        const b = el.getBoundingClientRect();
        const svg = el.querySelector("svg")?.getBoundingClientRect();
        return {
          overflow: el.scrollWidth - el.clientWidth,
          height: b.height,
          chevronInside:
            svg != null &&
            svg.width > 0 &&
            svg.left >= b.left &&
            svg.right <= b.right,
        };
      });
      expect(m.overflow, "Next label overflows the button").toBeLessThanOrEqual(
        0,
      );
      expect(m.chevronInside, "chevron visible inside the button").toBe(true);
      expect(m.height).toBeLessThanOrEqual(48);
      const docOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(docOverflow).toBeLessThanOrEqual(0);
    });
