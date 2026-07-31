import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// M9: the post-save celebration summary (ordinal + overview slides), the
// share-as-image card (client-rendered PNG, asserted via a download event), and
// workout photos attached at finish showing up in the history-detail carousel.

// A valid 8×8 PNG — decodable by createImageBitmap for the resize path (a 1×1
// PNG fails to decode in headless Chromium).
const PNG_8PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4o6GBFTEMLQkAe3tLAfuiUfAAAAAASUVORK5CYII=",
  "base64",
);

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

async function newExercise(page: Page, name: string) {
  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(name);
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, name);
}

async function startAndLog(
  page: Page,
  ex: string,
  sets: [string, string][],
): Promise<string> {
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  const id = page.url().split("/session/")[1];
  await page.getByTestId(`pick-exercise-${ex}`).click();
  for (let i = 0; i < sets.length; i++) {
    await page.getByTestId(`set-${i}-weight`).fill(sets[i][0]);
    await page.getByTestId(`set-${i}-reps`).fill(sets[i][1]);
    await page.getByTestId(`set-${i}-add`).click();
    await expect(page.getByTestId(`committed-${i}`)).toBeVisible();
  }
  return id;
}

test("post-save summary shows the ordinal, offers a hero-set pick, and shares a PNG across frames/grounds", async ({
  page,
}) => {
  const EX = `Summary ${Date.now()}`;
  await newExercise(page, EX);
  const id = await startAndLog(page, EX, [
    ["100", "5"],
    ["110", "3"],
  ]);

  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();

  // Lands on history detail with the celebration overlay (?summary=1).
  await expect(page).toHaveURL(new RegExp(`/history/${id}\\?summary=1`));
  await expect(page.getByTestId("post-save-summary")).toBeVisible();
  await expect(page.getByTestId("summary-ordinal")).toContainText("#");

  // Share the session slide → the full-screen sheet.
  await page.getByTestId("share-slide-hero").click();
  await expect(page.getByTestId("share-sheet")).toBeVisible();
  await expect(page.getByTestId("share-canvas")).toBeVisible();

  // The card actually rendered onto the canvas (full-res + an opaque pixel) —
  // guards against a blank-canvas regression that a download-only check misses.
  async function isPainted() {
    return page.getByTestId("share-canvas").evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d");
      if (!ctx || c.width < 1000) return false;
      return ctx.getImageData(20, 20, 1, 1).data[3] > 0;
    });
  }
  expect(await isPainted()).toBe(true);

  // The hero-set picker defaults to the auto top-set pick; tapping a specific
  // set re-renders the canvas with that set headlined instead.
  await expect(page.getByTestId("share-hero-auto")).toBeVisible();
  const setChip = page.getByTestId(new RegExp("^share-hero-set-"));
  await setChip.first().click();
  await expect(await isPainted()).toBe(true);

  // Switching frame/ground re-renders the canvas at the new frame's dimensions.
  const before = await page
    .getByTestId("share-canvas")
    .evaluate((c: HTMLCanvasElement) => `${c.width}x${c.height}`);
  await page.getByTestId("share-frame-square").click();
  await expect
    .poll(() =>
      page
        .getByTestId("share-canvas")
        .evaluate((c: HTMLCanvasElement) => `${c.width}x${c.height}`),
    )
    .not.toBe(before);
  await page.getByTestId("share-ground-green").click();
  expect(await isPainted()).toBe(true);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("share-save").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.png$/);

  // Dismiss the overlay → plain history detail underneath.
  await page.getByTestId("share-close").click();
  await page.getByTestId("summary-dismiss").click();
  await expect(page.getByTestId("post-save-summary")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/history/${id}$`));
});

test("photo attached at finish appears in the history carousel", async ({
  page,
}) => {
  const EX = `Photo ${Date.now()}`;
  await newExercise(page, EX);
  const id = await startAndLog(page, EX, [["80", "8"]]);

  await page.getByTestId("end-session-btn").click();

  // Attach a photo in the finish overlay (resized client-side, uploaded on save).
  await page.getByTestId("finish-photo-input").setInputFiles({
    name: "lift.png",
    mimeType: "image/png",
    buffer: PNG_8PX,
  });
  await expect(page.getByTestId("finish-photo-0")).toBeVisible();

  await page.getByTestId("finish-save").click();
  await expect(page).toHaveURL(new RegExp(`/history/${id}\\?summary=1`));

  // Dismiss the summary → the history-detail photo carousel shows the upload.
  await page.getByTestId("summary-dismiss").click();
  await expect(page.getByTestId("history-photos")).toBeVisible();
  await expect(page.getByTestId("history-photo-0")).toBeVisible();

  // It survives a reload (persisted server-side).
  await page.reload();
  await expect(page.getByTestId("history-photo-0")).toBeVisible();
});
