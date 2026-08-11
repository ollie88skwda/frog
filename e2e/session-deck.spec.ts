import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  openStation,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// The Focus Deck (session redesign R2, option D): ONE station fills the
// screen at a time, a horizontally scrollable rail under the session header
// says where you are, and the whole-workout view is a pull-up overview.
// These are the deck-shaped behaviours; the five criteria themselves are
// covered by rest-timer / unilateral-sets / machine-catalog / core-loop.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makeExercise(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
}

test("the rail names every station, badges its progress, and switches the deck", async ({
  page,
}) => {
  const A = `DeckA ${Date.now()}`;
  const B = `DeckB ${Date.now()}`;
  await makeExercise(page, A);
  await makeExercise(page, B);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${A}`).click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();

  // Adding an exercise brings its own station to the front — on a deck a new
  // exercise you can't see would read as "it wasn't added".
  await expect(page.getByTestId(`station-tab-${B}`)).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.getByTestId(`block-${B}`)).toBeVisible();
  // …and exactly one station is mounted.
  await expect(page.getByTestId(`block-${A}`)).toHaveCount(0);

  // Tapping the rail switches station.
  await openStation(page, A);
  await expect(page.getByTestId(`block-${B}`)).toHaveCount(0);

  // The badge counts physical sets as they land.
  await expect(page.getByTestId(`station-tab-${A}`)).toContainText("0");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-done").click();
  await expect(page.getByTestId(`station-tab-${A}`)).toContainText("1");
});

test("the overview lists every station, jumps to one, and reorders the session", async ({
  page,
}) => {
  const A = `OverviewA ${Date.now()}`;
  const B = `OverviewB ${Date.now()}`;
  await makeExercise(page, A);
  await makeExercise(page, B);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${A}`).click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await expect(page.getByTestId(`station-tab-${B}`)).toBeVisible();

  await page.getByTestId("session-overview-handle").click();
  const list = page.getByTestId("session-overview-list");
  await expect(list).toContainText(A);
  await expect(list).toContainText(B);

  // Tap to jump.
  await page.getByTestId(`overview-jump-${A}`).click();
  await expect(page.getByTestId(`block-${A}`)).toBeVisible();

  // Reorder: move B above A. The rail order follows, and so does the server.
  await page.getByTestId("session-overview-handle").click();
  await page.getByTestId(`overview-down-${A}`).click();
  const labels = await page
    .getByTestId("session-overview-list")
    .locator("[data-testid^='overview-jump-']")
    .allInnerTexts();
  expect(labels[0]).toContain(B);
  await page.keyboard.press("Escape");

  const sessionId = await page.evaluate(() =>
    location.pathname.split("/").pop(),
  );
  await expect
    .poll(() =>
      page.evaluate(async (sid) => {
        const { data } = await window.__frog.supabase
          .from("session_exercises")
          .select("order_index, exercises(name)")
          .eq("session_id", sid)
          .order("order_index");
        return (data ?? []).map(
          (r) => (r.exercises as unknown as { name: string })?.name,
        );
      }, sessionId),
    )
    .toEqual([B, A]);

  // …and it survives a reload.
  await page.reload();
  await expect(page.getByTestId(`station-tab-${A}`)).toBeVisible();
  const tabs = await page
    .getByTestId("station-rail")
    .locator("[data-testid^='station-tab-']")
    .allInnerTexts();
  expect(tabs[0]).toContain(B);
});

test("the reference line is the only place last-time and target are shown", async ({
  page,
}) => {
  // R4: one labeled line. The PREVIOUS column, the ghost placeholders inside
  // the inputs and the target-styled preview rows are all gone.
  await page.evaluate(() => localStorage.setItem("unit", "kg"));
  const EX = `Reference ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Nothing logged ever: the line says so in words rather than showing a
  // faint dash somewhere in a grid.
  await expect(page.getByTestId(`reference-${EX}-last`)).toHaveText(
    "— (new set)",
  );
  await expect(page.getByTestId("set-0-previous")).toHaveCount(0);

  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-done").click();
  await expect(page.getByTestId("committed-0")).toBeVisible();

  // Second session: LAST is labeled, and `use` fills the inputs.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await expect(page.getByTestId(`reference-${EX}-last`)).toHaveText("100 × 5");
  await expect(page.getByTestId("set-0-weight")).toHaveValue("");
  await expect(page.getByTestId("set-0-weight")).toHaveAttribute(
    "placeholder",
    "kg",
  );
  await page.getByTestId(`reference-${EX}-use`).click();
  await expect(page.getByTestId("set-0-weight")).toHaveValue("100");
  await expect(page.getByTestId("set-0-reps")).toHaveValue("5");
});
