import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// P5: findings surface. Seeds sessions directly through the signed-in client
// (fast; the logging UI path is covered by core-loop.spec.ts), then asserts
// the countdown → verdict transition on /findings.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function seedSessions(
  page: import("@playwright/test").Page,
  exerciseName: string,
  count: number,
) {
  await page.evaluate(
    async ({ exerciseName, count }) => {
      const sb = window.__frog.supabase;
      const uid = () => crypto.randomUUID();
      const now = Date.now();
      const DAY = 86_400_000;

      const exId = uid();
      let res = await sb.from("exercises").insert({
        id: exId,
        created_at: now,
        updated_at: now,
        name: exerciseName,
        is_custom: true,
      });
      if (res.error) throw new Error(res.error.message);

      for (let i = 0; i < count; i++) {
        const t = now - (count - i) * 3 * DAY;
        const sessionId = uid();
        res = await sb.from("sessions").insert({
          id: sessionId,
          created_at: t,
          updated_at: t,
          started_at: t,
        });
        if (res.error) throw new Error(res.error.message);
        const seId = uid();
        res = await sb.from("session_exercises").insert({
          id: seId,
          created_at: t,
          updated_at: t,
          session_id: sessionId,
          exercise_id: exId,
          order_index: 0,
        });
        if (res.error) throw new Error(res.error.message);
        res = await sb.from("set_logs").insert({
          id: uid(),
          created_at: t,
          updated_at: t,
          session_exercise_id: seId,
          set_no: 0,
          weight_kg: 100 + i * 5, // rising load → PROGRESSING
          reps: 5,
          completed: true,
        });
        if (res.error) throw new Error(res.error.message);
      }
    },
    { exerciseName, count },
  );
}

test("countdown appears below 5 sessions, verdict appears at 6", async ({ page }) => {
  const EX = `Trend Lift ${Date.now()}`;

  // 3 sessions → countdown (2 more needed).
  await seedSessions(page, EX, 3);
  await page.goto("/findings");
  await expect(page.getByTestId(`countdown-${EX}`)).toBeVisible();
  await expect(page.getByTestId(`countdown-${EX}`)).toContainText("2 more sessions");

  // 6 sessions total → PROGRESSING verdict for this exercise.
  const EX2 = `Trend Lift B ${Date.now()}`;
  await seedSessions(page, EX2, 6);
  await page.goto("/findings");
  await expect(page.getByTestId(`trend-${EX2}`)).toBeVisible();
  await expect(page.getByTestId(`trend-${EX2}`)).toContainText("PROGRESSING");
});
