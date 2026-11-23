import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  finishSession,
  makeExercise,
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
  // RIR never prefills: a dash on both sides.
  await expect(page.getByTestId("rir-column-left")).toHaveText("–");
  await expect(page.getByTestId("rir-column-right")).toHaveText("–");

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
  await expect(page.getByTestId("rir-column-left")).toHaveText("1");
  await ruler(page, "rir-column-right", "rir-ruler", [
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
  ]);
  await expect(page.getByTestId("rir-column-right")).toHaveText("5+");
  await expect(page.getByTestId("rir-ruler")).toHaveAttribute(
    "aria-valuemax",
    "5",
  );

  await page.getByTestId("log-set").click();
  await expect.poll(() => readPair(page, EX)).toHaveLength(2);
  const rows = await readPair(page, EX);
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
    ["left", 0, 30, 10, 1, 1],
    ["right", 0, 30, 8, 5, null],
  ]);

  // The logged row shows both sides.
  const sides = page.getByTestId("set-mark-0-sides");
  await expect(sides).toContainText(/30 × 10/);
  await expect(sides).toContainText(/30 × 8/);

  // Editing the pair opens on the side that was tapped.
  const box = await page.getByTestId("set-mark-0").boundingBox();
  const r = await sides.locator("[data-pair-right]").boundingBox();
  if (!box || !r) throw new Error("set row not laid out");
  await page.mouse.click(r.x + r.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("reps-ruler")).toHaveAttribute(
    "aria-label",
    "Right reps ruler",
  );
  await expect(page.getByTestId("reps-field-right")).toHaveValue("8");

  // Next session: the Now row's last hint shows both sides, reps prefill
  // per side, RIR stays blank.
  await finishSession(page);
  await startSessionWith(page, EX);
  const last = page.getByTestId("set-mark-last-sides");
  await expect(last).toContainText(/30 × 10/);
  await expect(last).toContainText(/30 × 8/);
  // The exercise itself is still bilateral, so per-side is opted into again.
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await expect(page.getByTestId("reps-field-left")).toHaveValue("10");
  await expect(page.getByTestId("reps-field-right")).toHaveValue("8");
  await expect(page.getByTestId("rir-column-left")).toHaveText("–");
});

test("validation names the side that's missing reps and selects it", async ({
  page,
}) => {
  const EX = await makeExercise(page, "PerSideE2Valid");
  await startSessionWith(page, EX);
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
      await expect(page.getByTestId("rir-column-right")).toHaveText("3");
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
      const sides = page.getByTestId("set-mark-0-sides");
      await expect(sides).toContainText("102.5 × 12");
      await expect(sides).toContainText("100 × 10");
      const clipped = await sides.evaluate(
        (el) => el.scrollWidth > el.clientWidth + 1,
      );
      expect(clipped).toBe(false);
    });
