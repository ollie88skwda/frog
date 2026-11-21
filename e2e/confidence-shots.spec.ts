// Confidence-percentage review screenshots (not part of normal CI):
// CONFIDENCE_SHOTS=out-dir bun scripts/run-e2e.ts e2e/confidence-shots.spec.ts
import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

const OUT = process.env.CONFIDENCE_SHOTS;
const SLEEP_ID = "00000000-0000-4000-8000-0000000000a1";
test.skip(!OUT, "screenshots only");
test.setTimeout(240_000);

async function seedSessions(
  page: import("@playwright/test").Page,
  exerciseName: string,
  count: number,
  opts?: {
    // Per-session weight in kg, indexed 0..count-1 (oldest first);
    // defaults to a rising load (100 + 5i → PROGRESSING).
    weights?: number[];
    // Per-session RIR range written on every set.
    rir?: Array<[number, number]>;
    // Per-session condition value (null = not logged).
    condition?: { metricId: string; values: Array<number | null> };
  },
) {
  await page.evaluate(
    async ({ exerciseName, count, opts }) => {
      const sb = window.__frog.db;
      const uid = () => crypto.randomUUID();
      const now = Date.now();
      const DAY = 86_400_000;
      const weights =
        opts.weights ?? Array.from({ length: count }, (_, i) => 100 + i * 5);

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
          condition_values: opts?.condition
            ? { [opts.condition.metricId]: opts.condition.values[i] ?? null }
            : null,
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
        const rir = opts?.rir?.[i];
        res = await sb.from("set_logs").insert({
          id: uid(),
          created_at: t,
          updated_at: t,
          session_exercise_id: seId,
          set_no: 0,
          weight_kg: weights[i],
          reps: 5,
          rir_min: rir?.[0] ?? null,
          rir_max: rir?.[1] ?? null,
          completed: true,
        });
        if (res.error) throw new Error(res.error.message);
      }
    },
    { exerciseName, count, opts: opts ?? {} },
  );
}

test("confidence screenshots, day and night", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e`");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("voiceRegister", "human"),
  );
  await signIn(page);
  const EX = `Bench ${Date.now() % 1000}`;
  const EX2 = `Squat ${Date.now() % 1000}`;
  // 5 noisy-but-rising sessions with sleep logged (tentative first guesses).
  await seedSessions(page, EX, 10, {
    weights: [80, 82.5, 80, 85, 82.5, 87.5, 85, 90, 87.5, 92.5],
    rir: Array.from({ length: 10 }, () => [2, 2] as [number, number]),
    condition: {
      metricId: SLEEP_ID,
      values: [6, 8, 6, 8, 6, 8, 6, 8, 6, 8],
    },
  });
  // A lift with only 3 noisy sessions: a tentative first guess.
  await seedSessions(page, EX2, 3, { weights: [100, 97.5, 105] });
  for (const mode of ["day", "night"] as const) {
    await page.evaluate((m) => localStorage.setItem("mode", m), mode);
    await page.goto("/");
    await expect(page.getByTestId("today-coach-card")).toBeVisible();
    await page.screenshot({ path: `${OUT}/today-coach-${mode}.png` });

    await page.goto("/progress?s=strength");
    await expect(page.getByText(/[0-9]+%/).first()).toBeVisible();
    await page.screenshot({ path: `${OUT}/progress-${mode}.png` });

    await page.goto("/progress?s=lab");
    await page
      .getByText(/on high/)
      .first()
      .click();
    await expect(page.getByTestId("finding-sheet")).toBeVisible();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/finding-sheet-${mode}.png` });

    await page.goto("/progress?s=strength");
    await page.getByText(EX, { exact: false }).first().click();
    await page.getByTestId("lift-header").waitFor();
    await page
      .getByTestId("lift-header")
      .getByRole("button", { name: /% confident/ })
      .click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/lift-why-${mode}.png` });
    await page.keyboard.press("Escape");

    await page.getByTestId("records-share-btn").click();
    await expect(page.getByTestId("share-canvas")).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/share-card-${mode}.png` });
  }
});
