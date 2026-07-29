import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// Machines: catalog search → "my gym", settings memory in the session setup
// strip, muscle-grouped library, and the RIR lesson InfoTip.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("library groups exercises by muscle with tier badges", async ({
  page,
}) => {
  await page.goto("/library");
  // Seed classifications put Squat & co under quads.
  await expect(page.getByTestId("muscle-group-quads")).toBeVisible();
  await expect(page.getByTestId("muscle-group-hamstrings")).toBeVisible();
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
  await page
    .getByTestId(`setting-value-${MACHINE}-Seat height`)
    .fill("4");

  // Custom exercise linked to the machine.
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, EX);
  await page.getByTestId(`exercise-row-toggle-${EX}`).click();
  const machineSelect = page.getByTestId(`machine-select-${EX}`);
  await machineSelect.selectOption({ label: `Matrix · ${MACHINE}` });

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
  await page.getByTestId("set-0-add-rir").click();
  await page.getByTestId("infotip-rir").click();
  await expect(page.getByText("RIR — reps in reserve")).toBeVisible();
  await expect(page.getByText(/reps you could still do/i)).toBeVisible();
});
