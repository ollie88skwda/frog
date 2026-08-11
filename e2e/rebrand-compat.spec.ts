import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  rowCount,
  signIn,
  waitForExercise,
} from "./helpers";

// The 2026-07-28 sbl → frog identifier rename kept exactly one read-old/
// write-new fallback on the browser side: an in-progress set draft. A user
// mid-set when the rename shipped must not lose keystrokes, and the restored
// draft must not outlive the commit that clears it (clearDraft removes both
// the new and the legacy key — see apps/web/src/lib/session-draft.ts).
// Delete this spec together with the fallback, one release after 2026-07-28.

const LEGACY_PREFIX = "sbl.sdraft.";
const PREFIX = "frog.sdraft.";

function draftKeys(page: Page) {
  return page.evaluate(
    ([a, b]) =>
      Object.keys(localStorage).filter(
        (k) => k.startsWith(a) || k.startsWith(b),
      ),
    [PREFIX, LEGACY_PREFIX],
  );
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a pre-rename set draft survives the rebrand and dies on commit", async ({
  page,
}, testInfo) => {
  const EX = `Rebrand ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await page.getByTestId("set-0-weight").fill("142.5");
  await page.getByTestId("set-0-reps").fill("7");
  await expect.poll(() => draftKeys(page)).toHaveLength(1);

  // Rewrite the draft under the pre-rename key, with a weight the user never
  // typed — a restore showing 137.5 can only have come from the legacy blob.
  await page.evaluate(
    ([prefix, legacy]) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith(prefix));
      if (!key) throw new Error("no draft to migrate");
      const snapshot = JSON.parse(localStorage.getItem(key) as string);
      snapshot.weight = "137.5";
      localStorage.setItem(
        legacy + key.slice(prefix.length),
        JSON.stringify(snapshot),
      );
      localStorage.removeItem(key);
    },
    [PREFIX, LEGACY_PREFIX],
  );

  await page.reload();
  await expect(page.getByTestId("set-0-weight")).toHaveValue("137.5");
  await expect(page.getByTestId("set-0-reps")).toHaveValue("7");
  await page.screenshot({ path: testInfo.outputPath("draft-restored.png") });

  // Committing the restored draft must clear both keys, or the draft would
  // reappear on the next load.
  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-reps").press("Enter");
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect.poll(() => draftKeys(page)).toEqual([]);

  await page.reload();
  // The strip advances to the next set on its own — and it must not inherit
  // anything from the stale legacy blob.
  await expect(page.getByTestId("set-1-weight")).toHaveValue("");
  await expect.poll(() => draftKeys(page)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("draft-cleared.png") });
});

test("exports download under the frog name", async ({ page }, testInfo) => {
  await page.goto("/settings");
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-json-btn").click(),
  ]);
  expect(json.suggestedFilename()).toMatch(
    /^frog-export-\d{4}-\d{2}-\d{2}\.json$/,
  );

  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-csv-btn").click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/^frog-sets-\d{4}-\d{2}-\d{2}\.csv$/);

  await page.getByTestId("token-name-input").fill("mcp-client");
  await page.getByTestId("create-token-btn").click();
  await expect(page.getByTestId("token-plaintext")).toContainText(/^frog_/);
  await page
    .getByRole("dialog")
    .screenshot({ path: testInfo.outputPath("settings-token.png") });
});
