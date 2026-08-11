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

/**
 * The session screen is a Focus Deck: exactly ONE station (exercise, or a
 * superset's shared card) is mounted at a time. Anything that touches a
 * second exercise has to bring its station to the front first — that's this.
 * Idempotent: switching to the station already showing is a no-op.
 */
export async function openStation(page: Page, label: string) {
  const tab = page.getByTestId(`station-tab-${label}`);
  await tab.waitFor();
  await tab.click();
  // Assert the switch actually stuck before handing back: adding an exercise
  // brings its own station to the front asynchronously, so a station opened
  // inside that window can be deactivated a beat later.
  await expect(tab).toHaveAttribute("data-state", "active");
  await expect(
    page.getByTestId(`block-${label.split(" + ")[0]}`),
  ).toBeVisible();
}

/** Flips a superset station's shared card to one of its members. */
export async function openMember(page: Page, name: string) {
  await page.getByTestId(`station-member-${name}`).click();
  await expect(page.getByTestId(`block-${name}`)).toBeVisible();
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
