import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// P5: findings surface. Seeds sessions directly through the signed-in client
// (fast; the logging UI path is covered by core-loop.spec.ts), then asserts
// the countdown → verdict transition on /findings and the note-12 drill-down:
// tapping a trend row opens a bottom sheet with charts + recommendations, and
// tapping a condition row opens its bucket breakdown.

// Seeded session-condition metric (seeds migration 20260712144107).
const SLEEP_ID = "00000000-0000-4000-8000-0000000000a1";

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  // Pin the neutral register so copy assertions don't depend on the device's
  // saved voice preference (frog is the default).
  await page.addInitScript(() =>
    localStorage.setItem("voiceRegister", "human"),
  );
  await signIn(page);
});

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
      const sb = window.__frog.supabase;
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

test("countdown appears below 5 sessions, verdict appears at 6", async ({
  page,
}) => {
  const EX = `Trend Lift ${Date.now()}`;

  // 3 sessions → countdown (2 more needed).
  await seedSessions(page, EX, 3);
  await page.goto("/findings");
  await expect(page.getByTestId(`countdown-${EX}`)).toBeVisible();
  await expect(page.getByTestId(`countdown-${EX}`)).toContainText(
    "2 more sessions",
  );

  // 6 sessions total → PROGRESSING verdict for this exercise.
  const EX2 = `Trend Lift B ${Date.now()}`;
  await seedSessions(page, EX2, 6);
  await page.goto("/findings");
  await expect(page.getByTestId(`trend-${EX2}`)).toBeVisible();
  await expect(page.getByTestId(`trend-${EX2}`)).toContainText("PROGRESSING");
});

test("tapping a plateau trend row opens the sheet with recommendations", async ({
  page,
}) => {
  const EX = `Flat Lift ${Date.now()}`;
  // Flat load, no RIR: PLATEAU → volume lever fires, RIR-gap nudge fires.
  await seedSessions(page, EX, 6, { weights: Array(6).fill(100) });
  await page.goto("/findings");

  const row = page.getByTestId(`trend-${EX}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("PLATEAU");
  await row.click();

  const sheet = page.getByTestId("findings-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Consider more volume");
  await expect(sheet).toContainText("Log RIR for intensity advice");
  await expect(sheet).toContainText("Correlation, not causation.");
  await expect(sheet.getByTestId("trend-sheet-e1rm-chart")).toBeVisible();

  // Full-history link stays on the findings page (no navigation on open).
  await expect(page).toHaveURL(/\/findings$/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("progressing row shows the keep-going recommendation", async ({
  page,
}) => {
  const EX = `Rising Lift ${Date.now()}`;
  await seedSessions(page, EX, 6, {
    weights: Array.from({ length: 6 }, (_, i) => 100 + i * 5),
    rir: Array.from({ length: 6 }, () => [2, 3] as [number, number]),
  });
  await page.goto("/findings");

  await page.getByTestId(`trend-${EX}`).click();
  const sheet = page.getByTestId("findings-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Keep going");
  // RIR context: full coverage, median of 2.5 midpoints.
  await expect(sheet).toContainText("RIR logged on 100% of sessions");
  await expect(sheet).toContainText("median @2.5");
});

test("tapping a condition row opens its bucket breakdown", async ({ page }) => {
  const EX = `Sleep Lift ${Date.now()}`;
  // 20 sessions, 10 well-slept (8h) heavier vs 10 short-slept (6h) lighter.
  await seedSessions(page, EX, 20, {
    weights: Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 110 : 95)),
    condition: {
      metricId: SLEEP_ID,
      values: Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 8 : 6)),
    },
  });
  await page.goto("/findings");

  const row = page.getByTestId("condition-Sleep (h)-tonnage");
  await expect(row).toBeVisible();
  await row.click();

  const sheet = page.getByTestId("condition-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("High Sleep (h) days");
  await expect(sheet).toContainText("Low Sleep (h) days");
  await expect(sheet).toContainText("Medium confidence");
  await expect(sheet).toContainText("Correlation, not causation.");
});
