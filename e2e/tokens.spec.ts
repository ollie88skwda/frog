import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// P6: PAT lifecycle — create in Settings, read through the Edge Function
// under the token, revoke, get rejected. The function runs inside local
// Supabase (supabase start serves supabase/functions/).

const API_BASE = `${process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321"}/functions/v1/api`;

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("create token, read own data via PAT API, revoke → 401", async ({
  page,
  request,
}) => {
  const NAME = `tok-${Date.now()}`;
  const EX = `Token Lift ${Date.now()}`;

  // Own a distinctive exercise to look for through the API.
  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  // The row is optimistic; wait for the insert to land before the full-page
  // nav (page.goto tears down the document and aborts the in-flight write, or
  // the PAT API below reads before the custom exercise exists server-side).
  await waitForExercise(page, EX);

  // Create a token; plaintext is shown once.
  await page.goto("/settings");
  await page.getByTestId("token-name-input").fill(NAME);
  await page.getByTestId("create-token-btn").click();
  const token =
    (await page.getByTestId("token-plaintext").textContent())?.trim() ?? "";
  expect(token).toMatch(/^frog_/);

  // Valid PAT → 200 with own data (seeds + the new exercise).
  const ok = await request.get(`${API_BASE}/v1/exercises?limit=1000`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(ok.status()).toBe(200);
  const body = (await ok.json()) as { exercises: { name: string }[] };
  expect(body.exercises.map((e) => e.name)).toContain(EX);

  // Bad token → 401.
  const bad = await request.get(`${API_BASE}/v1/exercises`, {
    headers: { authorization: "Bearer frog_definitely-not-a-token" },
  });
  expect(bad.status()).toBe(401);

  // Revoke → 401.
  await page.keyboard.press("Escape"); // close the plaintext dialog
  await page.getByTestId(`revoke-${NAME}`).click();
  await expect
    .poll(async () => {
      const res = await request.get(`${API_BASE}/v1/exercises`, {
        headers: { authorization: `Bearer ${token}` },
      });
      return res.status();
    })
    .toBe(401);
});
