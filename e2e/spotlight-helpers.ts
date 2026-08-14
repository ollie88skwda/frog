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
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${exerciseName}`).click();
  await expect(page.getByTestId("weight-field")).toBeVisible();
}

/** Fills the spotlight weight/reps fields directly (bilateral). */
export async function fillSet(page: Page, weight: string, reps: string) {
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
  await page.getByTestId("set-type-menu").click({ force: true });
}

/** Numeric value currently in a spotlight field. */
export async function fieldValue(page: Page, testId: string): Promise<number> {
  const v = await page.getByTestId(testId).inputValue();
  return Number.parseFloat(v);
}
