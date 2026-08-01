import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForConditionUntracked,
  waitForExercise,
  waitForSessionNotes,
} from "./helpers";

// P4 round-trips: session conditions (tracked defaults, auto-save, notes,
// custom typed conditions, stop-tracking) and a custom set-scope metric.

// Fixed seed ids of the default-tracked condition metrics (seeds migration).
const SLEEP_ID = "00000000-0000-4000-8000-0000000000a1";
const STRESS_ID = "00000000-0000-4000-8000-0000000000a5";

async function metricIdByName(
  page: import("@playwright/test").Page,
  name: string,
): Promise<string> {
  // Create is an optimistic, fire-and-forget mutation: the click returns before
  // the insert commits. Poll the row instead of a one-shot `.single()` (which
  // throws on 0 rows and races the write).
  let id = "";
  await expect
    .poll(async () => {
      id = await page.evaluate(async (n) => {
        const { data } = await window.__frog.supabase
          .from("metrics")
          .select("id")
          .eq("name", n)
          .maybeSingle();
        return (data?.id as string) ?? "";
      }, name);
      return id;
    })
    .not.toBe("");
  return id;
}

// A new session auto-opens the exercise picker (dismissable). Close it to
// reach the header (conditions chip, End).
async function dismissPicker(page: import("@playwright/test").Page) {
  const picker = page.getByRole("dialog");
  await picker.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "hidden" });
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("tracked defaults (Sleep, Stress) auto-save with no Save button", async ({
  page,
}) => {
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await dismissPicker(page);

  await page.getByTestId("conditions-chip").click();

  // Sleep + Stress are pre-loaded as tracked defaults — no preset-picking needed.
  const sleep = page.getByTestId(`condition-input-${SLEEP_ID}`);
  await expect(sleep).toBeVisible();
  await sleep.fill("7.5");
  await sleep.blur();

  // Stress is a 1–10 scale; tap segment 4.
  await page.getByTestId(`condition-scale-${STRESS_ID}-4`).click();

  // There is no Save button — everything auto-saves.
  await expect(page.getByTestId("conditions-save-btn")).toHaveCount(0);
  await expect(page.getByTestId("conditions-chip")).toContainText("7.5h");
  await expect(page.getByTestId("conditions-chip")).toContainText("stress 4");

  // Reload: values restore from the server.
  await page.reload();
  await expect(page.getByTestId("conditions-chip")).toContainText("7.5h");
  await expect(page.getByTestId("conditions-chip")).toContainText("stress 4");
});

test("session notes auto-save and round-trip", async ({ page }) => {
  const NOTE = `Legs heavy on warm-up ${Date.now()}`;

  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await dismissPicker(page);

  await page.getByTestId("conditions-chip").click();
  const notes = page.getByTestId("condition-notes");
  await notes.fill(NOTE);
  await notes.blur();
  await waitForSessionNotes(page, NOTE);

  // Reopen after reload: the note restored from the server.
  await page.reload();
  await dismissPicker(page); // empty session re-opens the picker on load
  await page.getByTestId("conditions-chip").click();
  await expect(page.getByTestId("condition-notes")).toHaveValue(NOTE);
});

test("create a custom number condition with a unit; value round-trips", async ({
  page,
}) => {
  const NAME = `Water ${Date.now()}`;

  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await dismissPicker(page);

  await page.getByTestId("conditions-chip").click();
  await page.getByTestId("condition-add-input").fill(NAME);
  await page.getByTestId("condition-type-number").click();
  await page.getByTestId("condition-unit-input").fill("ml");
  await page.getByTestId("condition-create-btn").click();

  const id = await metricIdByName(page, NAME);
  const field = page.getByTestId(`condition-input-${id}`);
  await expect(field).toBeVisible();
  await field.fill("500");
  await field.blur();
  await expect(page.getByTestId("conditions-chip")).toContainText("500ml");

  // The chip updates optimistically; the write to sessions.condition_values is
  // a background mutation, so reloading before it lands drops the value. Poll
  // the session row until the value is server-side.
  await expect
    .poll(() =>
      page.evaluate(async (metricId) => {
        const sessionId = window.location.pathname.split("/").at(-1) ?? "";
        const { data, error } = await window.__frog.supabase
          .from("sessions")
          .select("condition_values")
          .eq("id", sessionId)
          .single();
        if (error) throw new Error(error.message);
        const values = data?.condition_values as Record<
          string,
          unknown
        > | null;
        return values?.[metricId] ?? null;
      }, id),
    )
    .toBe(500);

  // Reload: custom condition + value restore from the server.
  await page.reload();
  await expect(page.getByTestId("conditions-chip")).toContainText("500ml");
});

test("stop tracking a default hides it from future sessions", async ({
  page,
}) => {
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await dismissPicker(page);

  // Untrack Sleep via its row menu.
  await page.getByTestId("conditions-chip").click();
  await expect(page.getByTestId(`condition-input-${SLEEP_ID}`)).toBeVisible();
  await page.getByTestId(`condition-menu-${SLEEP_ID}`).click();
  await page.getByTestId(`condition-untrack-${SLEEP_ID}`).click();
  // Optimistically removed from the current sheet.
  await expect(page.getByTestId(`condition-input-${SLEEP_ID}`)).toHaveCount(0);
  await waitForConditionUntracked(page, SLEEP_ID);

  // A brand-new session no longer pre-loads Sleep, but keeps Stress.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await dismissPicker(page);
  await page.getByTestId("conditions-chip").click();
  await expect(page.getByTestId(`condition-scale-${STRESS_ID}`)).toBeVisible();
  await expect(page.getByTestId(`condition-input-${SLEEP_ID}`)).toHaveCount(0);
});

test("custom set metric: create, enable on an exercise, log a value", async ({
  page,
}) => {
  const EX = `Machine Row ${Date.now()}`;
  const METRIC = `Seat height ${Date.now()}`;

  // Create exercise + metric, enable the metric for the exercise.
  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.getByTestId("metric-name-input").fill(METRIC);
  await page.getByTestId("add-metric-btn").click();
  await expect(page.getByTestId(`metric-row-${METRIC}`)).toBeVisible();

  await page.getByTestId(`exercise-row-toggle-${EX}`).click();
  // .click() + retrying assertion instead of .check(): the controlled checkbox
  // re-renders from the query cache one microtask after the click, which
  // .check()'s instant verification races (app behavior is correct).
  const enable = page.getByTestId(`enable-metric-${METRIC}-${EX}`);
  await enable.click();
  await expect(enable).toBeChecked();

  // Log a set carrying the metric value.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  // Reveal the custom-metric field via the ⋯ "add field" menu (named by
  // metric) — enabling it opens the big details sheet where it lives.
  await page.getByTestId("set-0-more").click();
  await page.getByRole("button", { name: METRIC, exact: true }).click();

  const metricInput = page.locator(`[data-testid^="set-0-metric-"]`);
  await expect(metricInput).toBeVisible();
  await metricInput.fill("4");
  await page.keyboard.press("Escape");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("10");
  await page.getByTestId("set-0-reps").press("Enter");

  // The metric value landed in set_logs.metric_values.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { data, error } = await window.__frog.supabase
          .from("set_logs")
          .select("metric_values")
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw new Error(error.message);
        const values = data?.[0]?.metric_values as Record<
          string,
          unknown
        > | null;
        return values ? Object.values(values)[0] : null;
      }),
    )
    .toBe(4);
});
