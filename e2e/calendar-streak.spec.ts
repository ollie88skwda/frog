import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Calendar + weekly streak (M6): a logged session fills its calendar day and
// lights the streak; an empty past day retro-logs a backdated session and opens
// the live editor; changing the first-day-of-week shifts the grid's start.

// Local YYYY-MM-DD (mirrors @sbl/core localDateKey; Node + the browser share
// this machine's timezone, so keys line up on both sides).
function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Insert a completed session at a given instant, straight through the signed-in
// client (owner_id defaults from the JWT sub under RLS) — the fast path to a
// known calendar state without walking the logging UI.
async function seedSession(page: Page, atMs: number) {
  await page.evaluate(async (t) => {
    const sb = window.__sbl.supabase;
    const { error } = await sb.from("sessions").insert({
      id: crypto.randomUUID(),
      created_at: t,
      updated_at: t,
      started_at: t,
      ended_at: t,
    });
    if (error) throw new Error(error.message);
  }, atMs);
}

function sessionsOnDay(page: Page, startMs: number, endMs: number) {
  return page.evaluate(
    async ({ s, e }) => {
      const { count, error } = await window.__sbl.supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .gte("started_at", s)
        .lt("started_at", e)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    { s: startMs, e: endMs },
  );
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a logged session fills its calendar day and lights the streak", async ({
  page,
}) => {
  const key = localKey(new Date());
  // Seed at the current instant (today, and never future-dated — computeStreak
  // ignores sessions dated after `now`).
  await seedSession(page, Date.now());

  await page.goto("/calendar");

  // Today's cell is filled…
  await expect(page.getByTestId(`cal-filled-${key}`)).toBeVisible();
  // …and the streak counts at least this week.
  await expect
    .poll(() =>
      page
        .getByTestId("streak-weeks")
        .textContent()
        .then((t) => Number(t)),
    )
    .toBeGreaterThanOrEqual(1);
});

test("retro-logging an empty past day creates a backdated session", async ({
  page,
}) => {
  await page.goto("/calendar");

  // Page back to the previous month (always fully in the past) and pick day 15.
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const key = localKey(prev);
  const dayStart = new Date(
    prev.getFullYear(),
    prev.getMonth(),
    prev.getDate(),
  ).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const before = await sessionsOnDay(page, dayStart, dayEnd);

  await page.getByTestId("cal-prev").click();
  await page.getByTestId(`cal-day-${key}`).click();
  await page.getByTestId("cal-log-workout").click();

  // Retro-log opens the live editor on a backdated session…
  await expect(page).toHaveURL(/\/session\//);
  // …and exactly one new session lands on that day.
  await expect
    .poll(() => sessionsOnDay(page, dayStart, dayEnd))
    .toBe(before + 1);
});

test("changing the first day of the week shifts the grid start", async ({
  page,
}) => {
  await page.goto("/calendar");

  // Sunday-start → the first column is Sunday. Radix Select: open + pick.
  await page.getByTestId("cal-first-weekday").click();
  await page.getByRole("option", { name: "Sunday" }).click();
  await expect(page.getByTestId("cal-weekday-0")).toHaveText("Su");

  // Saturday-start → the first column is Saturday (optimistic re-layout).
  await page.getByTestId("cal-first-weekday").click();
  await page.getByRole("option", { name: "Saturday" }).click();
  await expect(page.getByTestId("cal-weekday-0")).toHaveText("Sa");
});
