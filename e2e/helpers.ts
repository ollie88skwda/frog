import { expect, type Page } from "@playwright/test";

export const EMAIL = process.env.E2E_EMAIL ?? "";
export const PASSWORD = process.env.E2E_PASSWORD ?? "";

declare global {
  interface Window {
    __frog: { supabase: import("@supabase/supabase-js").SupabaseClient };
  }
}

export async function signIn(page: Page) {
  await page.goto("/auth");
  await page.waitForFunction(() => window.__frog !== undefined);
  await page.evaluate(
    async ({ email, password }) => {
      const { error } = await window.__frog.supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);
    },
    { email: EMAIL, password: PASSWORD },
  );
  await page.goto("/train");
  await expect(page.getByTestId("start-session-btn")).toBeVisible();
}

/** Creates a custom exercise via the Library "+ Custom exercise" sheet. Assumes
 * the caller is already on /library. */
export async function createExercise(page: Page, name: string) {
  await page.getByTestId("new-exercise-btn").click();
  await page.getByTestId("exercise-name-input").fill(name);
  await page.getByTestId("add-exercise-btn").click();
}

/** Poll until an exercise with this exact name exists server-side (optimistic
 * UI can show it before the insert lands; a full-page goto would abort it). */
export async function waitForExercise(page: Page, name: string) {
  await expect
    .poll(() =>
      page.evaluate(async (n) => {
        const { count, error } = await window.__frog.supabase
          .from("exercises")
          .select("id", { count: "exact", head: true })
          .eq("name", n);
        if (error) throw new Error(error.message);
        return count ?? 0;
      }, name),
    )
    .toBe(1);
}

/** Poll until this exercise has `expected` set_logs rows server-side (each
 * commit fires its inserts behind the optimistic row; a full-page goto would
 * abort them). A unilateral set is two rows. */
export async function waitForSetLogs(
  page: Page,
  exerciseName: string,
  expected: number,
) {
  await expect
    .poll(() =>
      page.evaluate(async (n) => {
        const { data: ex, error: exError } = await window.__frog.supabase
          .from("exercises")
          .select("id")
          .eq("name", n)
          .single();
        if (exError) throw new Error(exError.message);
        const { data: ses, error: sesError } = await window.__frog.supabase
          .from("session_exercises")
          .select("id")
          .eq("exercise_id", ex.id);
        if (sesError) throw new Error(sesError.message);
        if (!ses.length) return 0;
        const { count, error } = await window.__frog.supabase
          .from("set_logs")
          .select("id", { count: "exact", head: true })
          .in(
            "session_exercise_id",
            ses.map((s) => s.id),
          );
        if (error) throw new Error(error.message);
        return count ?? 0;
      }, exerciseName),
    )
    .toBe(expected);
}

/** Poll until the session notes have landed server-side (the notes mutation is
 * debounced + optimistic; a reload before it lands would abort the PATCH). */
export async function waitForSessionNotes(page: Page, notes: string) {
  await expect
    .poll(() =>
      page.evaluate(async (n) => {
        const { count, error } = await window.__frog.supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("notes", n);
        if (error) throw new Error(error.message);
        return count ?? 0;
      }, notes),
    )
    .toBe(1);
}

/** Poll until a condition is untracked server-side (the untrack mutation is
 * optimistic; a full-page goto before it lands would abort it). */
export async function waitForConditionUntracked(page: Page, metricId: string) {
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const { count, error } = await window.__frog.supabase
          .from("tracked_conditions")
          .select("id", { count: "exact", head: true })
          .eq("metric_id", id)
          .eq("tracked", false);
        if (error) throw new Error(error.message);
        return count ?? 0;
      }, metricId),
    )
    .toBe(1);
}

/** Rows the app still considers live — deletes are soft (`deleted_at`), so a
 * plain `rowCount` never drops after one. */
export async function liveRowCount(page: Page, table: string): Promise<number> {
  return page.evaluate(async (t) => {
    const { count, error } = await window.__frog.supabase
      .from(t)
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, table);
}

export async function rowCount(page: Page, table: string): Promise<number> {
  return page.evaluate(async (t) => {
    const { count, error } = await window.__frog.supabase
      .from(t)
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, table);
}

// --- the session's split read/write surfaces (redesign option E) ------------
// The ledger (`block-<name>` sections) is read-only; every input lives in the
// one logger drawer at the bottom, which points at a single exercise at a
// time. So a spec that wants to type has to point the logger first — these
// three helpers are how, and nothing else should reach into the drawer's
// internals.

/** The drawer animates to its snap point after `data-open` flips, so a click
 * dispatched the moment it opens can land on a moving target. Wait for the
 * panel to stop translating. */
async function settled(page: Page) {
  const drawer = page.getByTestId("logger-drawer");
  await expect(drawer).toBeVisible();
  await expect
    .poll(async () => {
      const a = (await drawer.boundingBox())?.y ?? -1;
      await page.waitForTimeout(120);
      const b = (await drawer.boundingBox())?.y ?? -2;
      return a === b;
    })
    .toBe(true);
}

/** Points the logger at an exercise and pulls it open (also ends any rest). */
export async function openLogger(page: Page, exerciseName: string) {
  await page.getByTestId(`block-${exerciseName}-open`).click();
  await expect(page.getByTestId("session-logger")).toHaveAttribute(
    "data-open",
    "1",
  );
  await settled(page);
}

/** Pulls the logger open on whatever exercise it already points at. The
 * drawer closes after every commit, so this runs before each new set. */
export async function pullUpLogger(page: Page) {
  const logger = page.getByTestId("session-logger");
  await expect(logger).toBeAttached();
  if ((await logger.getAttribute("data-open")) === "1") return;
  // While a rest stopwatch is running the bar IS the stopwatch — pulling it
  // up is what ends the rest.
  const resting = page.getByTestId("rest-open");
  if (await resting.count()) await resting.click();
  else await page.getByTestId("logger-peek").click();
  await expect(logger).toHaveAttribute("data-open", "1");
  await settled(page);
}

/** Fills the logger's fields for set `index` and commits it. */
export async function logSet(
  page: Page,
  index: number,
  values: Partial<Record<"weight" | "reps" | "duration" | "distance", string>>,
) {
  await pullUpLogger(page);
  for (const [field, value] of Object.entries(values)) {
    await page.getByTestId(`set-${index}-${field}`).fill(value);
  }
  await page.getByTestId(`set-${index}-add`).click();
}
