import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  addSet,
  fillSet,
  logSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Boss session UX round 2 (2026-11-25 r2, docs/ux-audit/2026-11-25-r2/session).
// One behavioural check per note; frames come from ux2-session-evidence.spec.ts.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

/** Whether the element's centre is the topmost hit and inside the viewport. */
function onScreen(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return (
      r.top >= 0 &&
      r.bottom <= window.innerHeight &&
      !!hit &&
      (hit === el || el.contains(hit))
    );
  });
}

test("item 6: from set 2 the ruler and Log stay on screen in a short, keyboard-sized viewport", async ({
  page,
}) => {
  await startSessionWith(page, await makeExercise(page, "Ruler"));
  // No ruler before the first logged set of the exercise.
  await page.getByTestId("weight-field").click();
  await expect(page.getByTestId("weight-ruler")).toHaveCount(0);
  await fillSet(page, "50", "10");
  await logSet(page);
  await addSet(page);
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  // 390x397 is what a 390x844 phone has left with the keyboard up.
  for (const [w, h] of [
    [390, 844],
    [390, 397],
    [360, 640],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.getByTestId("weight-field").click();
    await expect.poll(() => onScreen(page, "weight-ruler")).toBe(true);
    await expect.poll(() => onScreen(page, "log-set")).toBe(true);
  }
});

test("Add a set opens a set after a reload with more sets logged than planned", async ({
  page,
}) => {
  // Found on the iOS simulator: `addedSets` is device-local and reset by a
  // reload, so 3 logged sets on a 1-set plan needed 3 presses.
  await startSessionWith(page, await makeExercise(page, "Reload"));
  for (let i = 0; i < 3; i++) {
    await fillSet(page, "50", "10");
    await logSet(page);
    await expect(page.getByTestId("add-set-panel")).toBeVisible();
  }
  await page.reload();
  await page.getByTestId("add-set-panel").click();
  await expect(page.getByTestId("log-set")).toBeVisible();
});

test("iOS sim issue 1: a touch press alone never moves the active value; real focus does", async ({
  page,
}) => {
  // WebKit on iOS treats a tap whose pointerdown changes the DOM as a hover
  // and leaves focus (and typed digits) in the previous field, so the active
  // value must follow focus, never the press (Weight 105 -> tap Reps -> 5
  // used to give 1055).
  await startSessionWith(page, await makeExercise(page, "Focus"));
  await page.getByTestId("weight-field").click();
  await expect(page.getByTestId("entry-col-weight")).toHaveAttribute(
    "data-active",
    "true",
  );
  await page.getByTestId("reps-field").dispatchEvent("pointerdown", {
    pointerType: "touch",
    isPrimary: true,
  });
  await expect(page.getByTestId("entry-col-weight")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("entry-col-reps")).toHaveAttribute(
    "data-active",
    "false",
  );
  await page.getByTestId("reps-field").focus();
  await expect(page.getByTestId("entry-col-reps")).toHaveAttribute(
    "data-active",
    "true",
  );
});

test("per side with the keyboard up: the pinned ruler/Log never covers the focused weight or the Split button", async ({
  page,
}) => {
  // Seen on the iPhone 17 simulator (docs/ux-audit/2026-11-25-r2/session/
  // 10-after-rebased.png): the sticky footer overlapped the weight box's
  // bottom edge and half the Split button at a 404px visible height.
  await startSessionWith(page, await makeExercise(page, "Stack"));
  await fillSet(page, "50", "10");
  await logSet(page);
  await addSet(page);
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  // No last time yet: set 2 shows set 1's 50 as a grey placeholder (and the
  // ruler reads it), never a bare 0, and an untouched placeholder isn't a value.
  await expect(page.getByTestId("weight-field")).toHaveValue("");
  await expect(page.getByTestId("weight-field")).toHaveAttribute(
    "data-ghost",
    "50",
  );
  for (const [w, h] of [
    [390, 404],
    [360, 380],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.getByTestId("weight-field").focus();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const top = (id: string) =>
            document
              .querySelector(`[data-testid="${id}"]`)
              ?.getBoundingClientRect() as DOMRect;
          const footer = document
            .querySelector("[data-entry-footer]")
            ?.getBoundingClientRect() as DOMRect;
          const now = top("now-tab");
          const cell = top("entry-col-weight");
          const split = top("weight-split-toggle");
          console.log(
            JSON.stringify({
              now: [now.top, now.bottom],
              cell: [cell.top, cell.bottom],
              split: [split.top, split.bottom],
              footer: [footer.top, footer.bottom],
              inp: [top("weight-field").top, top("weight-field").bottom],
              panel: (() => {
                const p = document.querySelector(
                  '[data-testid="entry-panel"]',
                ) as HTMLElement;
                return [p.scrollTop, p.scrollHeight, p.clientHeight];
              })(),
            }),
          );
          return (
            cell.top >= now.bottom - 1 &&
            cell.bottom <= footer.top + 1 &&
            split.bottom <= footer.top + 1
          );
        }),
      )
      .toBe(true);
    await expect(page.getByTestId("weight-ruler-wrap")).toHaveAttribute(
      "data-ghost",
      "50",
    );
  }
});
