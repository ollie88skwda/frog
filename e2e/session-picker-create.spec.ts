import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Entry B (report §6.1) — the highest-value single change in the custom-
// exercise-adder plan: discovering mid-workout that a lift isn't in the book
// used to mean abandoning the session to add it in Library first.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("creating from the session picker's empty state adds the block with 0 sets", async ({
  page,
}) => {
  const NAME = `Picker Create ${Date.now()}`;

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);

  // Empty sessions auto-open the picker; search an unknown name.
  const search = page.getByTestId("exercise-search-input");
  await search.waitFor();
  await search.fill(NAME);
  await expect(page.getByText("No exercises match your search.")).toBeVisible();

  const createBtn = page.getByTestId("picker-create-exercise-btn");
  await expect(createBtn).toContainText(NAME);
  await createBtn.click();

  // The create sheet prefills the searched name.
  await expect(page.getByTestId("exercise-name-input")).toHaveValue(NAME);
  await page.getByTestId("add-exercise-btn").click();

  // Auto-selected: the picker closes and the spotlight opens on it with no
  // sets committed yet.
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId("exercise-name")).toHaveText(NAME);
  await expect(page.getByTestId("weight-field")).toHaveValue("");
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "current",
  );
});
