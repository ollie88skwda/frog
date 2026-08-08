import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Machines: catalog search → "my gym", settings memory in the session setup
// strip, muscle drill-down library (region → muscle → grouped sections), and
// the RIR lesson InfoTip.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("library drills down region → muscle into tier-grouped sections", async ({
  page,
}) => {
  await page.goto("/library");
  // Default view is the flat search-first list — no muscle sections yet.
  await expect(page.getByTestId("muscle-group-quads")).not.toBeVisible();
  // Two-level filter: Legs region narrows the muscle options to legs muscles.
  await page.getByTestId("exercise-region-select").click();
  await page.getByRole("option", { name: "Legs", exact: true }).click();
  await page.getByTestId("exercise-filter-select").click();
  await page.getByRole("option", { name: "Quads", exact: true }).click();
  // Selecting a muscle lands on the grouped sections (D2: groups survive
  // only inside a chosen muscle). Seed classifications put Squat & co under
  // quads.
  await expect(page.getByTestId("muscle-group-quads")).toBeVisible();
  // "Best for" panel opens with ranked joint actions.
  await page.getByTestId("best-for-quads").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Joint actions, ranked")).toBeVisible();
  await expect(
    dialog.getByText("Knee extension", { exact: true }).first(),
  ).toBeVisible();
});

test("machine from catalog: settings remembered into the session setup strip", async ({
  page,
}) => {
  const EX = `Ultra Row ${Date.now()}`;
  const MACHINE = "Ultra Diverging Seated Row";

  await page.goto("/library");

  // Add from the catalog search.
  await page
    .getByTestId("machine-catalog-search")
    .fill("matrix diverging seated row");
  await page
    .getByTestId("catalog-result-matrix-ultra-diverging-seated-row")
    .click();
  await expect(page.getByTestId(`machine-row-${MACHINE}`)).toBeVisible();

  // Enter a numbered setting: Seat height = 4.
  await page.getByTestId(`machine-row-${MACHINE}`).click();
  await page.getByTestId(`add-setting-${MACHINE}`).fill("Seat height");
  await page.getByTestId(`add-setting-${MACHINE}`).press("Enter");
  await page.getByTestId(`setting-value-${MACHINE}-Seat height`).fill("4");

  // Custom exercise linked to the machine, via the row's Edit sheet.
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  await page.getByTestId(`exercise-row-toggle-${EX}`).click();
  await page.getByTestId(`edit-exercise-${EX}`).click();
  await page.getByTestId("exercise-editor-machine").click();
  await page
    .getByRole("option", { name: `Matrix · ${MACHINE}`, exact: true })
    .click();
  await page.getByTestId("add-exercise-btn").click();

  // The link is a background write; wait for it to land before the full-page
  // nav below (page.goto tears down the document and aborts in-flight fetches).
  await expect
    .poll(async () =>
      page.evaluate(async (name) => {
        const { data } = await window.__frog.supabase
          .from("exercises")
          .select("machine_id")
          .eq("name", name)
          .maybeSingle();
        return (data?.machine_id as string) ?? null;
      }, EX),
    )
    .not.toBeNull();

  // In a session, the setup strip shows the remembered settings.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();
  const strip = page.getByTestId(`setup-strip-${EX}`);
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Seat height 4");

  // Edit in the dialog → persists (machine row is the memory).
  await strip.click();
  await page.getByTestId(`setting-value-${MACHINE}-Seat height`).fill("5");
  await page.keyboard.press("Escape");
  await expect(strip).toContainText("Seat height 5");
  await page.reload();
  await expect(page.getByTestId(`setup-strip-${EX}`)).toContainText(
    "Seat height 5",
  );
});

test("RIR InfoTip opens the lesson", async ({ page }) => {
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId("pick-exercise-Squat").click();
  await page.getByTestId("set-0-more").click();
  await page.getByTestId("infotip-rir").click();
  await expect(page.getByText("RIR — reps in reserve")).toBeVisible();
  await expect(page.getByText(/reps you could still do/i)).toBeVisible();
});
