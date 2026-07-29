import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Monthly report + Year in Review (M10). Seed sessions across two past months —
// month A sets baselines (no PRs), month B lifts heavier (PRs) — straight
// through the signed-in client (owner_id defaults from the JWT sub under RLS),
// then verify /stats/monthly shows the archive picker, totals, and the month's
// PRs, and /stats/year shows the year totals + PRs.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
  // Display kg so seeded canonical-kg weights read naturally (app defaults lb).
  await page.evaluate(() => localStorage.setItem("unit", "kg"));
});

async function seedExercise(page: Page, name: string): Promise<string> {
  return page.evaluate(async (n) => {
    const sb = window.__frog.supabase;
    const id = crypto.randomUUID();
    const t = Date.now();
    const { error } = await sb.from("exercises").insert({
      id,
      created_at: t,
      updated_at: t,
      name: n,
      exercise_type: "weight_reps",
    });
    if (error) throw new Error(error.message);
    return id;
  }, name);
}

// One completed session with its exercise block + weighted sets at a fixed
// instant (a full hour of active time so duration totals are non-zero).
async function seedSession(
  page: Page,
  exerciseId: string,
  atMs: number,
  sets: Array<[number, number]>,
) {
  await page.evaluate(
    async ({ exId, t, rows }) => {
      const sb = window.__frog.supabase;
      const sessionId = crypto.randomUUID();
      const seId = crypto.randomUUID();
      const fail = (m: string | undefined) => {
        if (m) throw new Error(m);
      };
      fail(
        (
          await sb.from("sessions").insert({
            id: sessionId,
            created_at: t,
            updated_at: t,
            started_at: t,
            ended_at: t + 3_600_000,
          })
        ).error?.message,
      );
      fail(
        (
          await sb.from("session_exercises").insert({
            id: seId,
            created_at: t,
            updated_at: t,
            session_id: sessionId,
            exercise_id: exId,
            order_index: 0,
          })
        ).error?.message,
      );
      fail(
        (
          await sb.from("set_logs").insert(
            rows.map(([w, r], i) => ({
              id: crypto.randomUUID(),
              created_at: t,
              updated_at: t,
              session_exercise_id: seId,
              set_no: i,
              set_type: "normal",
              weight_kg: w,
              reps: r,
              completed: true,
            })),
          )
        ).error?.message,
      );
    },
    { exId: exerciseId, t: atMs, rows: sets },
  );
}

// Noon on day 15 of the month `offset` months before now — always fully in the
// past, so both months are "completed" and appear in the archive.
function monthDay15(offset: number): { at: number; year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 15, 12, 0, 0, 0);
  return { at: d.getTime(), year: d.getFullYear(), month: d.getMonth() };
}

test("monthly report: archive picker, totals, and the month's PRs", async ({
  page,
}) => {
  const EX = `Report ${Date.now()}`;
  const exId = await seedExercise(page, EX);

  const a = monthDay15(2); // baseline month (no PRs)
  const b = monthDay15(1); // heavier month (PRs)
  await seedSession(page, exId, a.at, [
    [100, 5],
    [100, 5],
  ]);
  await seedSession(page, exId, b.at, [
    [120, 5],
    [120, 3],
  ]);

  await page.goto("/stats/monthly");

  // The archive lists both seeded months (Frog keeps every completed month).
  await expect(page.getByTestId("monthly-picker")).toBeVisible();
  await expect(
    page.getByTestId(`monthly-month-${b.year}-${b.month}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`monthly-month-${a.year}-${a.month}`),
  ).toBeVisible();

  // Month B: totals render and the heavier lift shows as a PR for this exercise.
  await page.getByTestId(`monthly-month-${b.year}-${b.month}`).click();
  await expect(page.getByTestId("monthly-totals")).toBeVisible();
  await expect(page.getByTestId("monthly-prs")).toContainText(EX);

  // A PR row deep-links into the session it happened in.
  await page.getByTestId("monthly-pr-heaviest_weight").first().click();
  await expect(page).toHaveURL(/\/history\//);

  // Month A is this exercise's first-ever log → it earns no PR that month.
  await page.goto("/stats/monthly");
  await page.getByTestId(`monthly-month-${a.year}-${a.month}`).click();
  await expect(page.getByTestId("monthly-totals")).toBeVisible();
  await expect(page.getByTestId("monthly-prs")).not.toContainText(EX);
});

test("year in review: year picker shows totals and PRs", async ({ page }) => {
  const EX = `Year ${Date.now()}`;
  const exId = await seedExercise(page, EX);

  const a = monthDay15(2);
  const b = monthDay15(1);
  await seedSession(page, exId, a.at, [[100, 5]]);
  await seedSession(page, exId, b.at, [[120, 5]]);

  await page.goto("/stats/year");

  await expect(page.getByTestId("year-picker")).toBeVisible();
  await page.getByTestId(`year-tab-${b.year}`).click();

  // Totals for the year are populated, and the PR falls in this year.
  await expect(page.getByTestId("year-totals")).toBeVisible();
  await expect(page.getByTestId("year-workouts")).toContainText(/[1-9]/);
  await expect(page.getByTestId("year-prs")).toContainText(EX);
});
