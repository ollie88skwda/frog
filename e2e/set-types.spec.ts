import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";
import {
  logBilateralSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Set types under the Spotlight redesign (testid-contract.md): the ⋯ menu
// only offers warm-up / per-side / delete. Failure and Drop, and the old
// draft/committed number-cell type editor, are gone — see
// spotlight-set-menu.spec.ts for the "no superset/drop-set control anywhere"
// assertion this file doesn't duplicate.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("warm-up marks a set, persists across reload, via the set-type menu", async ({
  page,
}) => {
  const EX = `SetType ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await startSessionWith(page, EX);

  await openSetTypeMenu(page);
  await page.getByTestId("set-type-warmup").click();
  await logBilateralSet(page, "60", "12");
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "warmup",
  );

  // A plain set afterward has no special mark state.
  await logBilateralSet(page, "80", "8");
  await expect(page.getByTestId("set-mark-1-state")).toHaveAttribute(
    "data-state",
    "done",
  );

  await page.reload();
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "warmup",
  );
  await expect(page.getByTestId("set-mark-1-state")).toHaveAttribute(
    "data-state",
    "done",
  );
});

test("the set-type menu never offers Failure or Drop", async ({ page }) => {
  // Name avoids the substrings "failure"/"drop" — the exercise name itself
  // renders on screen and would false-positive the absence assertions below.
  const EX = await makeExercise(page, "SetTypeMenuScope");
  await startSessionWith(page, EX);

  await openSetTypeMenu(page);
  await expect(page.getByText(/failure/i)).toHaveCount(0);
  await expect(page.getByText(/drop/i)).toHaveCount(0);
});

test("delete via the set-type menu is a same-hook two-tap confirm", async ({
  page,
}) => {
  // Contract only names set-type-delete — one item, no *-confirm hook. The
  // real implementation reuses that same testid for both taps: the first
  // arms a confirm step (label flips to "Confirm delete"), the second commits.
  const EX = await makeExercise(page, "SetTypeDelete");
  await startSessionWith(page, EX);

  await logBilateralSet(page, "50", "5");
  await page.getByTestId("set-mark-0").click();
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-delete").click();
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  ); // not deleted yet — armed only
  await page.getByTestId("set-type-delete").click();

  // Ad-hoc session, no routine — deleting the only set leaves nothing
  // committed, so slot 0 becomes the next set to log ("current"), not a
  // pre-rendered "todo" placeholder.
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "current",
  );
});
