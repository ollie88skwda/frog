import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Machine-catalog lookup UX (machine-DB plan phase 3): server-side search +
// category browse in the library picker, and the in-session attach affordance
// on block headers that have no machine yet.

// Creates a custom exercise via the session picker's create flow and returns
// to the block (used because machine attachment writes exercises.machine_id,
// and seed rows are read-only under RLS — custom rows are the writable ones).
async function createExerciseInSession(
  page: import("@playwright/test").Page,
  name: string,
) {
  const search = page.getByTestId("exercise-search-input");
  await search.waitFor();
  await search.fill(name);
  await page.getByTestId("picker-create-exercise-btn").click();
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId(`block-${name}`)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("catalog search is server-side and browse filters by category", async ({
  page,
}) => {
  await page.goto("/library");

  // Search-as-you-type over brand+model, served from machine_catalog.
  await page
    .getByTestId("machine-catalog-search")
    .fill("matrix diverging seated");
  await expect(
    page.getByTestId("catalog-result-matrix-ultra-diverging-seated-row"),
  ).toBeVisible();

  // Gibberish → the no-match message (register-transformed copy), not an
  // error.
  await page.getByTestId("machine-catalog-search").fill("zzzz not a machine");
  await expect(
    page.getByText(/No (matches in the catalog|specimens match the catalog)\./),
  ).toBeVisible();

  // Clearing the query reveals browse-by-type chips; tapping one lists only
  // that category (Cybex Eagle NX is within the first chest-press page).
  await page.getByTestId("machine-catalog-search").fill("");
  await page.getByTestId("catalog-category-chest-press").click();
  await expect(
    page.getByTestId("catalog-result-cybex-eagle-nx-chest-press"),
  ).toBeVisible();
  // A row machine (Matrix seated row) is not a chest press — filtered out.
  await expect(
    page.getByTestId("catalog-result-matrix-ultra-diverging-seated-row"),
  ).toHaveCount(0);
});

test("in-session attach: catalog search attaches a machine to the block", async ({
  page,
}) => {
  const NAME = `Attach ${Date.now()}`;

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await createExerciseInSession(page, NAME);

  // No machine set → the attach action lives in the block's ⋯ menu (no
  // full-width strip under the header).
  await page.getByTestId(`block-${NAME}-menu`).click();
  const strip = page.getByTestId(`setup-attach-${NAME}`);
  await expect(strip).toBeVisible();
  await strip.click();

  // Search the catalog inside the dialog and pick a Life Fitness press (a
  // machine no other spec creates, so the shared e2e user stays clean).
  await page
    .getByTestId("machine-catalog-search")
    .fill("life fitness insignia");
  await page
    .getByTestId("catalog-result-life-fitness-insignia-series-chest-press")
    .click();

  // Dialog closes; the block now shows the remembered-setup strip.
  await expect(page.getByTestId(`setup-strip-${NAME}`)).toContainText(
    "Life Fitness · Insignia Series Chest Press",
  );

  // Server-side: the exercise really is attached (optimistic UI first). The
  // picker-created exercise is a published shared row (owner_id null,
  // RLS-immutable — community phase), so the attach forks a private copy
  // named "<name> (copy)" and repoints the block; the machine_id lands on
  // the copy, not the shared original.
  await expect
    .poll(async () =>
      page.evaluate(async (exerciseName) => {
        const { data } = await window.__frog.supabase
          .from("exercises")
          .select("machine_id")
          .eq("name", exerciseName)
          .maybeSingle();
        return (data?.machine_id as string) ?? null;
      }, `${NAME} (copy)`),
    )
    .not.toBeNull();
});

test("in-session attach: picks an existing machine from my gym", async ({
  page,
}) => {
  const NAME = `Attach existing ${Date.now()}`;

  // Add a machine in the library first (optimistic row; wait for the insert
  // to land before the full-page nav below).
  await page.goto("/library");
  await page
    .getByTestId("machine-catalog-search")
    .fill("matrix ultra converging");
  await page
    .getByTestId("catalog-result-matrix-ultra-converging-chest-press")
    .click();
  await expect(
    page.getByTestId("machine-row-Ultra Converging Chest Press"),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(async (machineName) => {
        const { count } = await window.__frog.supabase
          .from("machines")
          .select("id", { count: "exact", head: true })
          .eq("name", machineName);
        return count ?? 0;
      }, "Ultra Converging Chest Press"),
    )
    .toBe(1);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await createExerciseInSession(page, NAME);
  await page.getByTestId(`block-${NAME}-menu`).click();
  await page.getByTestId(`setup-attach-${NAME}`).click();

  // The dialog lists the user's own machines first — no duplicate created.
  await page
    .getByTestId("attach-existing-Ultra Converging Chest Press")
    .click();
  await expect(page.getByTestId(`setup-strip-${NAME}`)).toContainText(
    "Matrix · Ultra Converging Chest Press",
  );
});
