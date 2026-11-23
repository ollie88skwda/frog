import { expect, type Page } from "@playwright/test";
import { createExercise, waitForExercise } from "./helpers";

// Shared helpers for the Spotlight session screen (fm/frog-session-spotlight).
// Every hook used here comes from the binding contract at
// /Users/Ollie/firstmate/data/frog-session-spotlight/testid-contract.md —
// do not add a new testid assumption here without it being in that file.

/** Creates a fresh custom exercise and returns its name. */
export async function makeExercise(page: Page, label: string): Promise<string> {
  const name = `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
  return name;
}

/** Starts a new session and picks `exerciseName` as its first exercise. */
export async function startSessionWith(page: Page, exerciseName: string) {
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${exerciseName}`).click();
  await expect(page.getByTestId("weight-field")).toBeVisible();
}

/** Opens the next set the way a user does: "Add a set". Log never creates
 * one, so a spec that logs a second set on an unplanned exercise calls this
 * (fillSet does it automatically when no entry panel is showing). */
export async function addSet(page: Page) {
  await page.getByTestId("add-set").click();
  await expect(page.getByTestId("log-set")).toBeVisible();
}

/** Opens a set for entry when none is open (Log never creates one). */
export async function ensureOpenSet(page: Page) {
  if (await page.getByTestId("log-set").isVisible()) return;
  if (await page.getByTestId("add-set").isVisible()) await addSet(page);
}

/** Fills the spotlight weight/reps fields directly (bilateral, or the active
 * side of a per-side set). */
export async function fillSet(page: Page, weight: string, reps: string) {
  if (!(await page.getByTestId("weight-field").isVisible())) await addSet(page);
  await page.getByTestId("weight-field").fill(weight);
  await page.getByTestId("reps-field").fill(reps);
}

/** Per-side: selects a side tab, then fills that side's own numbers. */
export async function fillSide(
  page: Page,
  side: "left" | "right",
  weight: string,
  reps: string,
) {
  await page.getByTestId(`side-tab-${side}`).click();
  await page.getByTestId("weight-field").fill(weight);
  await page.getByTestId("reps-field").fill(reps);
}

/** Commits the current spotlight set via the Log button. */
export async function logSet(page: Page) {
  await page.getByTestId("log-set").click();
}

/** Fills and commits one bilateral set in a single call. */
export async function logBilateralSet(
  page: Page,
  weight: string,
  reps: string,
) {
  await fillSet(page, weight, reps);
  await logSet(page);
}

/** Ends the session and saves it from the finish overlay (unchanged surface —
 * outside the redesigned hero/marks/rest areas the contract covers). Waits
 * for the history navigation so a caller that immediately starts a new
 * session can rely on this one being fully persisted (the ghost/last-time
 * lookup for the next session's spotlight reads whatever's landed server-
 * side, and a page.goto right behind an in-flight finish write can abort it). */
export async function finishSession(page: Page) {
  await page.getByTestId("session-menu").click();
  await page.getByTestId("session-finish").click();
  await page.getByTestId("finish-save").click();
  await expect(page).toHaveURL(/\/history\//);
}

/** Reads the 0-based index implied by the "Set N" heading. */
export async function currentSetIndex(page: Page): Promise<number> {
  const text = (await page.getByTestId("set-number").innerText()).trim();
  const m = text.match(/(\d+)/);
  if (!m) throw new Error(`unexpected set-number text: "${text}"`);
  return Number.parseInt(m[1], 10) - 1;
}

/** Opens the per-set ⋯ menu. Force-clicked: Playwright's actionability check
 * intermittently (and reproducibly, independent of exercise name/timing)
 * reports this specific trigger as intercepted by its own wrapping span or
 * the sticky header, even though `elementFromPoint` at the same coordinates
 * resolves to the button correctly before and after the click — a Playwright
 * hit-testing false positive on this element, not a real overlap (verified:
 * a plain force click opens the menu immediately, every time). */
export async function openSetTypeMenu(page: Page) {
  const trigger = page.getByTestId("set-type-menu");
  // The per-side panel can be taller than the viewport; keep the trigger
  // clear of the sticky header before the (forced) click.
  await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await trigger.click({ force: true });
}

/** Numeric value currently in a spotlight field. */
export async function fieldValue(page: Page, testId: string): Promise<number> {
  const v = await page.getByTestId(testId).inputValue();
  return Number.parseFloat(v);
}

/** Opens the conditions dialog via the session ⋯ menu. */
export async function openConditions(page: Page) {
  await page.getByTestId("session-menu").click();
  await page.getByTestId("conditions-chip").click();
}

/** Asserts the ⋯ menu's conditions row text, then closes the menu. */
export async function expectConditionsText(page: Page, text: string) {
  await page.keyboard.press("Escape"); // close an open conditions dialog
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByTestId("session-menu").click();
  await expect(page.getByTestId("conditions-chip")).toContainText(text);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("conditions-chip")).toHaveCount(0);
}
