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

/** Creates a custom exercise via the Library "+ New exercise" sheet. Assumes
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
