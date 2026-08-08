import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// M3 supersets: the exercise ⋯ menu links two blocks into a superset (color
// bar + data-superset marker), persists the grouping server-side, dissolves a
// lone remainder on unlink, and — with Smart Superset Scrolling on — scrolls to
// the next member when a set is completed.

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

  // Neither is grouped yet.
  await expect(page.getByTestId(`block-${A}`)).not.toHaveAttribute(
    "data-superset",
    "1",
  );

  // Link A with B via A's overflow menu → the Superset option opens the
  // partner picker sheet (note 14), which lists every other exercise.
  await page.getByTestId(`block-${A}-menu`).click();
  await page.getByTestId(`block-${A}-superset`).click();
  await page.getByTestId(`block-${A}-superset-${B}`).click();

  await expect(page.getByTestId(`block-${A}`)).toHaveAttribute(
    "data-superset",
    "1",
  );
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
  await expect(page.getByTestId(`block-${A}`)).toHaveAttribute(
    "data-superset",
    "1",
  );
  await expect(page.getByTestId(`block-${B}`)).toHaveAttribute(
    "data-superset",
    "1",
  );

  // Unlinking A leaves B alone → the group dissolves for both.
  await page.getByTestId(`block-${A}-menu`).click();
  await page.getByTestId(`block-${A}-unsuperset`).click();
  await expect(page.getByTestId(`block-${A}`)).not.toHaveAttribute(
    "data-superset",
    "1",
  );
  await expect(page.getByTestId(`block-${B}`)).not.toHaveAttribute(
    "data-superset",
    "1",
  );
});

test("Smart Superset Scrolling advances to the next member (and respects the off pref)", async ({
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

  await page.getByTestId(`block-${A}-menu`).click();
  // Superset opens the partner picker sheet; the member is chosen there.
  await page.getByTestId(`block-${A}-superset`).click();
  await page.getByTestId(`block-${A}-superset-${B}`).click();

  // Spy on scrollIntoView so the assertion is deterministic (headless can't
  // observe smooth-scroll position reliably).
  await page.evaluate(() => {
    (window as unknown as { __scrolled: (string | null)[] }).__scrolled = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(
      this: Element,
      ...args: unknown[]
    ) {
      (window as unknown as { __scrolled: (string | null)[] }).__scrolled.push(
        this.getAttribute("data-testid"),
      );
      return (orig as (...a: unknown[]) => void).apply(this, args);
    };
  });

  // Complete a set in A → the view scrolls to B (the next superset member).
  const blockA = page.getByTestId(`block-${A}`);
  await blockA.getByTestId("set-0-weight").fill("100");
  await blockA.getByTestId("set-0-reps").fill("5");
  await blockA.getByTestId("set-0-add").click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __scrolled: (string | null)[] }).__scrolled,
      ),
    )
    .toContain(`block-${B}`);

  // Wait for set 0 to persist before reloading — otherwise the restored block
  // has no committed set and the active row is still index 0.
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

  // Turn the pref off → completing another set no longer scrolls.
  await page.evaluate(() => {
    localStorage.setItem("smartSupersetScroll", "0");
    (window as unknown as { __scrolled: (string | null)[] }).__scrolled = [];
  });
  await page.reload();
  const blockA2 = page.getByTestId(`block-${A}`);
  // No auto-advance: the reloaded block has one committed set and no open
  // draft (nothing was typed into one before reloading) — open it explicitly.
  await blockA2.getByTestId("set-1-add").click();
  await blockA2.getByTestId("set-1-weight").fill("100");
  await blockA2.getByTestId("set-1-reps").fill("5");
  // Re-install the spy (reload cleared it).
  await page.evaluate(() => {
    (window as unknown as { __scrolled: (string | null)[] }).__scrolled = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(
      this: Element,
      ...args: unknown[]
    ) {
      (window as unknown as { __scrolled: (string | null)[] }).__scrolled.push(
        this.getAttribute("data-testid"),
      );
      return (orig as (...a: unknown[]) => void).apply(this, args);
    };
  });
  await blockA2.getByTestId("set-1-add").click();
  await expect(
    page.getByTestId(`block-${A}`).getByTestId("committed-1"),
  ).toBeVisible();
  const scrolled = await page.evaluate(
    () => (window as unknown as { __scrolled: (string | null)[] }).__scrolled,
  );
  expect(scrolled).not.toContain(`block-${B}`);
});
