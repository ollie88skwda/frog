import { expect, type Page } from "@playwright/test";

export const EMAIL = process.env.E2E_EMAIL ?? "";
export const PASSWORD = process.env.E2E_PASSWORD ?? "";

declare global {
  interface Window {
    __sbl: { supabase: import("@supabase/supabase-js").SupabaseClient };
  }
}

export async function signIn(page: Page) {
  await page.goto("/auth");
  await page.waitForFunction(() => window.__sbl !== undefined);
  await page.evaluate(
    async ({ email, password }) => {
      const { error } = await window.__sbl.supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);
    },
    { email: EMAIL, password: PASSWORD },
  );
  await page.goto("/");
  await expect(page.getByTestId("start-session-btn")).toBeVisible();
}

export async function rowCount(page: Page, table: string): Promise<number> {
  return page.evaluate(async (t) => {
    const { count, error } = await window.__sbl.supabase
      .from(t)
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, table);
}
