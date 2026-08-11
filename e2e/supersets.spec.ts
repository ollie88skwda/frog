import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  openMember,
  openStation,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// M3 supersets: the exercise ⋯ menu links two blocks into a superset (color
// bar + data-superset marker) — on the Focus Deck that means the two share ONE
// station card behind an A/B flip. The grouping persists server-side, a lone
// remainder dissolves on unlink, and — with Smart Superset Scrolling on —
// logging a set flips the card to the next member.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makeExercise(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
}

test("link two exercises into a superset, persist across reload, unlink dissolves", async ({
  page,
}) => {
  const A = `SupersetA ${Date.now()}`;
  const B = `SupersetB ${Date.now()}`;
  await makeExercise(page, A);
  await makeExercise(page, B);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${A}`).click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();

  // Two separate stations in the rail, neither grouped.
  await expect(page.getByTestId(`station-tab-${A}`)).toBeVisible();
  await expect(page.getByTestId(`station-tab-${B}`)).toBeVisible();
  await openStation(page, A);
  await expect(page.getByTestId(`block-${A}`)).not.toHaveAttribute(
    "data-superset",
    "1",
  );

  // Link A with B via A's overflow menu → the Superset option opens the
  // partner picker sheet (note 14), which lists every other exercise.
  await page.getByTestId(`block-${A}-menu`).click();
  await page.getByTestId(`block-${A}-superset`).click();
  await page.getByTestId(`block-${A}-superset-${B}`).click();

  // The pair collapses into ONE station whose card carries an A/B flip.
  await expect(page.getByTestId(`station-tab-${A} + ${B}`)).toBeVisible();
  await expect(page.getByTestId(`station-tab-${A}`)).toHaveCount(0);
  await expect(page.getByTestId(`block-${A}`)).toHaveAttribute(
    "data-superset",
    "1",
  );
  await openMember(page, B);
  await expect(page.getByTestId(`block-${B}`)).toHaveAttribute(
    "data-superset",
    "1",
  );

  // The grouping is persisted (session_exercises.superset_group) — the link
  // write is fire-and-forget, so wait for it to land before reloading (under
  // full-suite load the reload can otherwise win the race and read a session
  // that was never grouped). Scoped to THIS session: earlier specs leave their
  // own active sessions open, so a bare ended_at-null filter would mix users.
  const sessionId = await page.evaluate(() =>
    location.pathname.split("/").pop(),
  );
  await expect
    .poll(() =>
      page.evaluate(async (sid) => {
        const { data } = await window.__frog.supabase
          .from("session_exercises")
          .select("superset_group")
          .eq("session_id", sid);
        return data?.every((r) => r.superset_group != null) ?? false;
      }, sessionId),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByTestId(`station-tab-${A} + ${B}`)).toBeVisible();
  await expect(page.getByTestId(`block-${A}`)).toHaveAttribute(
    "data-superset",
    "1",
  );

  // Unlinking A leaves B alone → the group dissolves for both, and the deck
  // splits back into two stations.
  await page.getByTestId(`block-${A}-menu`).click();
  await page.getByTestId(`block-${A}-unsuperset`).click();
  await expect(page.getByTestId(`block-${A}`)).not.toHaveAttribute(
    "data-superset",
    "1",
  );
  await expect(page.getByTestId(`station-tab-${A}`)).toBeVisible();
  await openStation(page, B);
  await expect(page.getByTestId(`block-${B}`)).not.toHaveAttribute(
    "data-superset",
    "1",
  );
});

test("Smart Superset advance flips the shared card to the next member (and respects the off pref)", async ({
  page,
}) => {
  const A = `ScrollA ${Date.now()}`;
  const B = `ScrollB ${Date.now()}`;
  await makeExercise(page, A);
  await makeExercise(page, B);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${A}`).click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  // Wait for B's station to exist before switching back: picking an exercise
  // brings its own station to the front, which would otherwise steal the deck
  // right after we switched away from it.
  await expect(page.getByTestId(`station-tab-${B}`)).toBeVisible();

  await openStation(page, A);
  await page.getByTestId(`block-${A}-menu`).click();
  // Superset opens the partner picker sheet; the member is chosen there.
  await page.getByTestId(`block-${A}-superset`).click();
  await page.getByTestId(`block-${A}-superset-${B}`).click();
  await expect(page.getByTestId(`block-${A}`)).toBeVisible();

  // Log a set in A → the shared card flips to B. On the deck the sibling
  // isn't further down the page, it's the other side of one card, so the old
  // scrollIntoView advance is now a tab flip.
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-done").click();

  await expect(page.getByTestId(`block-${B}`)).toBeVisible();
  await expect(page.getByTestId(`block-${A}`)).toHaveCount(0);

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { count } = await window.__frog.supabase
          .from("set_logs")
          .select("id", { count: "exact", head: true });
        return count ?? 0;
      }),
    )
    .toBeGreaterThan(0);

  // Turn the pref off → logging another set no longer advances.
  await page.evaluate(() => localStorage.setItem("smartSupersetScroll", "0"));
  await page.reload();
  await openMember(page, A);
  await page.getByTestId("set-1-weight").fill("100");
  await page.getByTestId("set-1-reps").fill("5");
  await page.getByTestId("set-1-done").click();

  await expect(
    page.getByTestId(`block-${A}`).getByTestId("committed-1"),
  ).toBeVisible();
  await expect(page.getByTestId(`block-${B}`)).toHaveCount(0);
});
