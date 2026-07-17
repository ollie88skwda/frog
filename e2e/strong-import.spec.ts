import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// M12: Strong CSV import — two-phase parse-preview → import, mirroring Hevy.
// Asserts the round-trip lands sessions in history with lb→kg conversion and
// the warm-up set type carried through.

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("import Strong CSV → history with kg conversion + warm-ups", async ({
  page,
}) => {
  // Unique titles + far-past dates so the run's shared user never collides with
  // another spec's sessions (import is idempotent by started_at).
  const stamp = Date.now();
  const push = `Strong Push ${stamp}`;
  const pull = `Strong Pull ${stamp}`;
  const d1 = new Date(stamp - 420 * 86_400_000);
  const d2 = new Date(stamp - 418 * 86_400_000);
  const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Weight Unit,Reps,RPE,Distance,Distance Unit,Seconds,Notes,Workout Notes
${fmt(d1)},${push},1h 10m,Bench Press (Barbell),W,60,kg,8,,,,,warm,
${fmt(d1)},${push},1h 10m,Bench Press (Barbell),1,100,kg,5,8,,,,,
${fmt(d2)},${pull},45m,Deadlift (Barbell),1,315,lbs,3,,,,,,
`;

  await page.goto("/settings");
  await page.getByTestId("import-strong-input").setInputFiles({
    name: "strong.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  // Preview counts before importing.
  await expect(page.getByTestId("import-strong-status")).toContainText(
    "2 sessions",
  );

  await page.getByTestId("import-strong-btn").click();
  // Default register is frog: the done line reads "Recorded: 2 sessions (…)".
  await expect(page.getByTestId("import-strong-status")).toContainText(
    "Recorded: 2 sessions",
  );

  // Server truth: warm-up set type preserved + deadlift 315 lb → ~142.9 kg.
  const result = await page.evaluate(
    async ({ push, pull }) => {
      const sb = window.__sbl.supabase;
      const { data: sessions } = await sb
        .from("sessions")
        .select("id,title")
        .in("title", [push, pull]);
      const pushId = sessions?.find((s) => s.title === push)?.id;
      const pullId = sessions?.find((s) => s.title === pull)?.id;
      const { data: se } = await sb
        .from("session_exercises")
        .select("id,session_id")
        .in("session_id", [pushId, pullId]);
      const pushSe = (se ?? []).filter((x) => x.session_id === pushId).map((x) => x.id);
      const pullSe = (se ?? []).filter((x) => x.session_id === pullId).map((x) => x.id);
      const { data: pushSets } = await sb
        .from("set_logs")
        .select("set_type")
        .in("session_exercise_id", pushSe);
      const { data: pullSets } = await sb
        .from("set_logs")
        .select("weight_kg")
        .in("session_exercise_id", pullSe);
      return {
        warmups: (pushSets ?? []).filter((s) => s.set_type === "warmup").length,
        deadliftKg: (pullSets ?? [])[0]?.weight_kg ?? null,
      };
    },
    { push, pull },
  );

  expect(result.warmups).toBeGreaterThanOrEqual(1);
  expect(result.deadliftKg).toBeCloseTo(142.88, 1);

  // Appears in history. The imported sessions are far-past-dated, so on a
  // shared full-suite user they sit beyond page 1 — page through until found.
  await page.goto("/history");
  await expect(
    page.locator('[data-testid^="history-row-"]').first(),
  ).toBeVisible();
  for (let i = 0; i < 20; i++) {
    if (await page.getByText(push).isVisible()) break;
    const more = page.getByRole("button", { name: /load more|loading/i });
    if (!(await more.isVisible())) break;
    const before = await page.locator('[data-testid^="history-row-"]').count();
    await more.click();
    await expect
      .poll(
        () => page.locator('[data-testid^="history-row-"]').count(),
        { timeout: 5000 },
      )
      .toBeGreaterThan(before);
  }
  await expect(page.getByText(push)).toBeVisible();
});
