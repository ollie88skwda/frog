import { expect, test } from "@playwright/test";
import { createExercise, EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// M1 set types: the set-number cell assigns Normal / Warm-up / Failure / Drop,
// renders a W/F/D marker, persists via the log + update paths, and survives a
// reload (restored from set_logs.set_type).

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

// Fills the active weight/reps row and commits it via its Add-set button.
async function logSet(
  page: import("@playwright/test").Page,
  index: number,
  weight: string,
  reps: string,
) {
  await page.getByTestId(`set-${index}-weight`).fill(weight);
  await page.getByTestId(`set-${index}-reps`).fill(reps);
  await page.getByTestId(`set-${index}-add`).click();
  await expect(page.getByTestId(`committed-${index}-type`)).toBeVisible();
}

// Counts set_logs rows of a given type created at/after `since` — scopes a
// poll to this test's own inserts instead of any type-matching row left over
// from earlier local runs.
async function typeCountSince(
  page: import("@playwright/test").Page,
  setType: string,
  since: number,
) {
  return page.evaluate(
    async ({ setType, since }) => {
      const { count, error } = await window.__frog.supabase
        .from("set_logs")
        .select("id", { count: "exact", head: true })
        .eq("set_type", setType)
        .gte("created_at", since);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    { setType, since },
  );
}

test("assign W/F/D markers on the draft row, edit a committed type, persist across reload", async ({
  page,
}) => {
  const since = Date.now();
  const EX = `SetType ${since}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Set 0 → Warm-up before committing.
  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-warmup").click();
  await logSet(page, 0, "60", "12");
  await expect(page.getByTestId("committed-0-type")).toHaveText("W");

  // Set 1 → Drop.
  await page.getByTestId("set-1-type").click();
  await page.getByTestId("set-1-type-drop").click();
  await logSet(page, 1, "40", "10");
  await expect(page.getByTestId("committed-1-type")).toHaveText("D");

  // Set 2 → left Normal, shows its number.
  await logSet(page, 2, "40", "8");
  await expect(page.getByTestId("committed-2-type")).toHaveText("3");

  // Set 0's own insert (not just any of the three — each set's log fires an
  // independent request, and they can land out of order) must reach the
  // server before editing it: the edit updates by real server id, translated
  // from the optimistic id via a map that only populates once that specific
  // insert's response comes back. Editing too early silently no-ops (the
  // update matches zero rows under the stale optimistic id).
  await expect.poll(() => typeCountSince(page, "warmup", since)).toBe(1);

  // Re-type a committed set (Warm-up → Failure) via its number-cell menu.
  await page.getByTestId("committed-0-type").click();
  await page.getByTestId("committed-0-type-failure").click();
  await expect(page.getByTestId("committed-0-type")).toHaveText("F");

  // The edit is optimistic — wait for it to land server-side before
  // reloading, otherwise the reload can race the in-flight update.
  await expect.poll(() => typeCountSince(page, "failure", since)).toBe(1);

  // Reload resumes the session; markers come back from the server.
  await page.reload();
  await expect(page.getByTestId("committed-0-type")).toHaveText("F");
  await expect(page.getByTestId("committed-1-type")).toHaveText("D");
  await expect(page.getByTestId("committed-2-type")).toHaveText("3");
});

test("Delete Set in the set-details sheet requires confirmation before removing a committed set", async ({
  page,
}) => {
  const EX = `SetTypeRemove ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await logSet(page, 0, "50", "5");
  await expect(page.getByTestId("committed-0")).toBeVisible();

  await page.getByTestId("committed-0").hover();
  await page.getByTestId("set-menu-0").click();
  await page.getByTestId("set-menu-0-delete").click();
  // Not deleted yet — the first tap only arms the confirm step.
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await page.getByTestId("set-menu-0-delete-confirm").click();
  await expect(page.getByTestId("committed-0")).toBeHidden();
});
