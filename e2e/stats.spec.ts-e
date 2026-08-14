import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// M8 statistics hub: log two sessions across different muscle groups, then the
// /stats screen aggregates them — last-7-day heat map, sets-per-muscle chart
// (with working range/granularity controls), muscle distribution + totals, and
// a ranked main-exercises list that deep-links to exercise detail.

// Squat (legs) and Bench Press (chest/arms/shoulders via primary + secondary
// muscle targets) between them light five of the six body regions.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
  // kg display so typed weights map 1:1 to the canonical store (app defaults lb).
  await page.evaluate(() => localStorage.setItem("unit", "kg"));
});

async function logSet(page: Page, index: number, weight: string, reps: string) {
  await page.getByTestId(`set-${index}-weight`).fill(weight);
  await page.getByTestId(`set-${index}-reps`).fill(reps);
  await page.getByTestId(`set-${index}-add`).click();
  await expect(page.getByTestId(`committed-${index}-type`)).toBeVisible();
}

// One seed exercise per session (keeps set-input testids unambiguous), two sets.
async function logSession(
  page: Page,
  exercise: string,
  sets: [string, string][],
) {
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId("exercise-search-input").fill(exercise);
  await page.getByTestId(`pick-exercise-${exercise}`).click();
  for (let i = 0; i < sets.length; i++) {
    await logSet(page, i, sets[i][0], sets[i][1]);
  }
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await expect(page).not.toHaveURL(/\/session\//);
}

test("stats hub aggregates two sessions across muscle groups", async ({
  page,
}) => {
  await logSession(page, "Squat", [
    ["140", "5"],
    ["140", "5"],
  ]);
  await logSession(page, "Bench Press", [
    ["100", "5"],
    ["100", "8"],
  ]);

  // Reached from the Profile Statistics dashboard button.
  await page.goto("/profile");
  await page.getByTestId("dash-statistics").click();
  await expect(page).toHaveURL(/\/stats$/);

  // Last-7-days: consistency mini-bars + rolling body heat map render.
  await expect(page.getByTestId("consistency-bars")).toBeVisible();
  await expect(page.getByTestId("seven-day-heatmap")).toBeVisible();

  // Heat maps render the library human-body figure (react-body-highlighter):
  // each map holds an anterior + posterior SVG, and the region chips expose
  // the trained regions (Squat → legs, Bench → chest).
  const sevenDay = page.getByTestId("seven-day-heatmap");
  await expect(sevenDay.locator(".rbh")).toHaveCount(2);
  await expect(sevenDay.getByTestId("heatmap-chip-chest")).toBeVisible();
  await expect(sevenDay.getByTestId("heatmap-chip-legs")).toBeVisible();

  // Sets-per-muscle chart renders; the ranked breakdown exposes trained
  // muscles (Squat → quads, Bench → pecs) without per-muscle colors.
  await expect(page.getByTestId("sets-per-muscle-chart")).toBeVisible();
  await expect(page.getByTestId("spm-row-quads")).toBeVisible();
  await expect(page.getByTestId("spm-row-pecs")).toBeVisible();

  // Distribution totals: two workouts counted this period.
  await expect(page.getByTestId("distribution-chart")).toBeVisible();
  await expect(page.getByTestId("distribution-totals")).toContainText(
    "Workouts",
  );

  // Main exercises: a ranked list renders (top-15 cap — on a shared
  // full-suite user our two lifts can legitimately fall below the cut, so
  // assert structure + behavior rather than specific rows).
  const mainRows = page.locator('[data-testid^="main-exercise-"]');
  await expect(mainRows.first()).toBeVisible();

  // Tapping a main exercise deep-links to its detail screen.
  const firstId = (await mainRows.first().getAttribute("data-testid"))?.replace(
    "main-exercise-",
    "",
  );
  await mainRows.first().click();
  await expect(page).toHaveURL(new RegExp(`/exercises/${firstId}`));
});

test("range and granularity controls re-bucket the sets-per-muscle chart", async ({
  page,
}) => {
  await logSession(page, "Bench Press", [["100", "5"]]);

  await page.goto("/stats");
  await expect(page.getByTestId("sets-per-muscle-chart")).toBeVisible();

  // Weekly (default) → the bucket is labeled by its week-start date. Switching
  // to yearly re-buckets so a single bar labeled with the current year appears.
  const year = String(new Date().getFullYear());
  await page.getByTestId("spm-gran-year").click();
  await expect(page.getByTestId("sets-per-muscle-chart")).toContainText(year);

  // Distribution range chip stays interactive across all four ranges.
  await page.getByTestId("dist-range-all").click();
  await expect(page.getByTestId("distribution-chart")).toBeVisible();
});

const DAY = 86_400_000;

// Insert a bare completed session with an explicit duration, straight through
// the signed-in client (owner_id defaults from the JWT sub under RLS) — the
// Workouts/Duration totals only need the session row itself, no exercises
// (see distributionWindow in packages/core/src/stats/aggregate.ts).
async function seedTimedSession(
  page: Page,
  startedAt: number,
  durationMs: number,
) {
  await page.evaluate(
    async ({ startedAt, durationMs }) => {
      const sb = window.__frog.supabase;
      const t = Date.now();
      const { error } = await sb.from("sessions").insert({
        id: crypto.randomUUID(),
        created_at: t,
        updated_at: t,
        started_at: startedAt,
        ended_at: startedAt + durationMs,
      });
      if (error) throw new Error(error.message);
    },
    { startedAt, durationMs },
  );
}

test("muscle distribution Duration delta renders as a human-readable duration, not raw ms", async ({
  page,
}) => {
  const now = Date.now();

  // A large current-period session (30d range's default window) makes the
  // delta unambiguously positive — dominates any incidental session duration
  // other specs seed on this shared E2E account.
  await seedTimedSession(page, now - DAY, 300 * 60_000); // 5h

  await page.goto("/stats");
  const durationRow = page.getByTestId("dist-total-duration");
  await expect(durationRow).toBeVisible();
  await expect(durationRow).toContainText(/▲ \d+h \d+m/);
  // Regression guard: the delta must never render as a bare ms count.
  await expect(durationRow).not.toContainText(/▲ \d{5,}\s*$/);

  // An even larger previous-period session flips the sign — the negative
  // delta must format the same way, not as a bare negative/raw number.
  await seedTimedSession(page, now - 40 * DAY, 3000 * 60_000); // 50h
  await page.reload();
  await expect(durationRow).toContainText(/▼ \d+h \d+m/);
});
