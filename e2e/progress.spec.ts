import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Progress tab (redesign §8.7/§8.8): tiles, the six sections, the Lift page.
// Replaces the old stats.spec.ts / findings.spec.ts, which targeted the
// pre-redesign /stats and /findings screens. Sessions are seeded straight
// through the signed-in client (the logging UI is covered by today-flow.spec.ts).

const SLEEP_ID = "00000000-0000-4000-8000-0000000000a1";

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => {
    localStorage.setItem("unit", "kg");
    localStorage.setItem("voiceRegister", "human");
  });
  await signIn(page);
});

/** Seeds `count` finished sessions of a fresh exercise, oldest first, one
 * working set of 5 reps each. Returns the exercise id. */
async function seedLift(
  page: Page,
  name: string,
  count: number,
  opts: {
    weights?: number[];
    rir?: number;
    sleep?: Array<number | null>;
    primaryMuscle?: string;
  } = {},
): Promise<string> {
  return page.evaluate(
    async ({ name, count, opts, sleepId }) => {
      const sb = window.__frog.db;
      const uid = () => crypto.randomUUID();
      const now = Date.now();
      const D = 86_400_000;
      const weights =
        opts.weights ?? Array.from({ length: count }, (_, i) => 100 + i * 5);
      const exId = uid();
      let res = await sb.from("exercises").insert({
        id: exId,
        created_at: now,
        updated_at: now,
        name,
        is_custom: true,
        mechanic: "compound",
        muscle_targets: [{ muscle: "pecs", tier: "primary", role: "primary" }],
      });
      if (res.error) throw new Error(res.error.message);
      for (let i = 0; i < count; i++) {
        const t = now - (count - i) * D;
        const sessionId = uid();
        res = await sb.from("sessions").insert({
          id: sessionId,
          created_at: t,
          updated_at: t,
          started_at: t,
          ended_at: t + 3_600_000,
          condition_values: opts.sleep
            ? { [sleepId]: opts.sleep[i] ?? null }
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
        res = await sb.from("set_logs").insert({
          id: uid(),
          created_at: t,
          updated_at: t,
          session_exercise_id: seId,
          set_no: 0,
          weight_kg: weights[i],
          reps: 5,
          rir_min: opts.rir ?? null,
          rir_max: opts.rir ?? null,
          completed: true,
        });
        if (res.error) throw new Error(res.error.message);
      }
      return exId;
    },
    { name, count, opts, sleepId: SLEEP_ID },
  );
}

test("overview tiles and all six sections render with honest copy", async ({
  page,
}) => {
  await seedLift(page, `Prog Lift ${Date.now()}`, 3, { rir: 2 });
  await page.goto("/progress");

  await expect(page.getByTestId("progress-screen")).toBeVisible();
  const tiles = page.getByTestId("progress-tiles");
  await expect(tiles).toBeVisible();
  for (const label of [
    "Hard sets, 7 days",
    "Sessions, 7 days",
    "Lifts progressing",
    "RIR logged",
    "Bodyweight, 7-day avg",
    "Weekly streak",
  ])
    await expect(tiles).toContainText(label);

  // Every segment is reachable and selecting it writes ?s=.
  for (const seg of ["coach", "volume", "strength", "effort", "body", "lab"]) {
    await page.getByTestId(`progress-seg-${seg}`).click();
    await expect(page).toHaveURL(new RegExp(`s=${seg}`));
    await expect(page.getByTestId("progress-screen")).toBeVisible();
  }

  // Strength carries the formula note (Brzycki + RIR, 10% swing, 7 sessions).
  await page.getByTestId("progress-seg-strength").click();
  await expect(page.getByTestId("progress-screen")).toContainText(
    "Brzycki with RIR",
  );
  // Lab states its caveat plainly when there is nothing to find yet.
  await page.getByTestId("progress-seg-lab").click();
  await expect(page.getByTestId("progress-screen")).toContainText(
    /Consistency calendar/,
  );
});

test("a seeded lift shows in Strength and opens its Lift page", async ({
  page,
}) => {
  const EX = `Rise Lift ${Date.now()}`;
  const id = await seedLift(page, EX, 7);

  await page.goto("/progress?s=strength");
  const row = page.getByText(EX, { exact: true }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/exercises/${id}`));
  await expect(page.getByTestId("lift-header")).toBeVisible();
  await expect(page.getByTestId("lift-header")).toContainText("e1RM (Brzycki)");
  await expect(page.getByTestId("lift-bandchart")).toBeVisible();
});

test("under 7 sessions a verdict is a tentative best guess with a %", async ({
  page,
}) => {
  const EX = `Rough Lift ${Date.now()}`;
  await seedLift(page, EX, 3, { weights: [100, 110, 120] });
  await page.goto("/progress?s=strength");
  const body = page.getByTestId("progress-screen");
  await expect(body.getByText(EX, { exact: true }).first()).toBeVisible();
  await expect(body).toContainText(/Maybe progressing · \d+%/);
});

test("a condition finding names n and says correlation, not causation", async ({
  page,
}) => {
  const EX = `Sleep Lift ${Date.now()}`;
  await seedLift(page, EX, 20, {
    weights: Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 110 : 95)),
    sleep: Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 8 : 6)),
  });
  await page.goto("/progress?s=lab");
  const row = page.getByRole("button", { name: /Sleep \(h\) days/ }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/n=\d+ high/);
  await expect(row).toContainText("correlation, not causation");
  await row.click();
  await expect(page.getByRole("dialog")).toContainText(
    "Correlation, not causation.",
  );
});
