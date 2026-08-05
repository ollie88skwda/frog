import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

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
  await createExercise(page, name);
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
  const setChip = page.getByTestId(/^share-hero-set-/);
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

// The "heavy" tagline tone (lib/frog-tagline.ts) fires when the session
// out-tonnages the trailing 4-week average and neither a PR nor a streak
// claimed the slide. Asserted where the user actually sees it — the painted
// card — by sharing the SAME session twice: once from the post-save session
// slide (tone "heavy") and once from history detail (no tone → "normal").
// Same card body, different caption band.
test("post-save session slide paints the heavy tagline when the session out-tonnages the trailing average", async ({
  page,
}) => {
  // Three full log-and-finish sessions, two library adds and three 1080×1920
  // canvas paints — well past the config's 30 s default on a loaded runner.
  test.setTimeout(120_000);
  const evidenceDir = process.env.E2E_EVIDENCE_DIR;
  if (evidenceDir) mkdirSync(evidenceDir, { recursive: true });

  // Pin the word-bank pick so the two captions are stable strings:
  // heavy → "A heavy-handed frog for every single rep.",
  // normal → "A live frog for every single rep."
  await page.addInitScript(() => {
    Math.random = () => 0;
  });

  const stamp = Date.now();
  const BASE = `Baseline ${stamp}`;
  const HEAVY = `Heavy ${stamp}`;
  await newExercise(page, BASE);
  await newExercise(page, HEAVY);

  // Session 1 — the trailing-average baseline: 2 000 kg of tonnage.
  await startAndLog(page, BASE, [
    ["100", "10"],
    ["100", "10"],
  ]);
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await expect(page.getByTestId("post-save-summary")).toBeVisible();
  await page.getByTestId("summary-dismiss").click();

  // Session 2 — 4 000 kg on a brand-new exercise, so no PR event fires (an
  // exercise's first-ever session only seeds baselines), and it is not the
  // week's first workout, so no streak slide either. Only "heavy" is left.
  const id = await startAndLog(page, HEAVY, [
    ["100", "8"],
    ["100", "8"],
    ["100", "8"],
    ["100", "8"],
    ["100", "8"],
  ]);
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await expect(page).toHaveURL(new RegExp(`/history/${id}\\?summary=1`));
  await expect(page.getByTestId("post-save-summary")).toBeVisible();
  await expect(page.getByTestId("share-slide-pr")).toHaveCount(0);
  await expect(page.getByTestId("share-slide-streak")).toHaveCount(0);

  // The tagline sits in the Story frame's footer zone (paint.ts paintFooter);
  // the body band above it carries the ordinal, hero set and graphic.
  async function bandHashes() {
    await expect
      .poll(() =>
        page
          .getByTestId("share-canvas")
          .evaluate((c: HTMLCanvasElement) => c.width),
      )
      .toBe(1080);
    return page.getByTestId("share-canvas").evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      const hash = (y: number, h: number) => {
        const d = ctx.getImageData(0, y, c.width, h).data;
        let acc = 0;
        for (let i = 0; i < d.length; i += 4)
          acc = (acc * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
        return acc;
      };
      return { tagline: hash(1405, 60), body: hash(300, 900) };
    });
  }

  await expect(page.getByTestId("share-slide-hero")).toBeEnabled();
  await page.getByTestId("share-slide-hero").click();
  await expect(page.getByTestId("share-canvas")).toBeVisible();
  const heavy = await bandHashes();
  if (evidenceDir) {
    await page
      .getByTestId("share-sheet")
      .screenshot({ path: join(evidenceDir, "heavy-share-sheet.png") });
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("share-save").click(),
    ]);
    await dl.saveAs(join(evidenceDir, "heavy-tone-card.png"));
  }

  // Same session, shared from history detail — that call site passes no tone.
  await page.getByTestId("share-close").click();
  await page.getByTestId("summary-dismiss").click();
  await expect(page.getByTestId("post-save-summary")).toHaveCount(0);
  await page.getByTestId("history-share-btn").click();
  await expect(page.getByTestId("share-canvas")).toBeVisible();
  const normal = await bandHashes();
  if (evidenceDir) {
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("share-save").click(),
    ]);
    await dl.saveAs(join(evidenceDir, "normal-tone-card.png"));
  }

  // Caption changed; every other pixel of the card body did not.
  expect(heavy.tagline).not.toBe(normal.tagline);
  expect(heavy.body).toBe(normal.body);

  // Session 3 — a light session (100 kg, well under the 3 000 kg trailing
  // average) on another new exercise: the tone gate has to fall back to
  // "normal", so the post-save slide paints the same caption history detail
  // does. Guards against a tone that is simply always on.
  const LIGHT = `Light ${stamp}`;
  await newExercise(page, LIGHT);
  await startAndLog(page, LIGHT, [["20", "5"]]);
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await expect(page.getByTestId("post-save-summary")).toBeVisible();
  await expect(page.getByTestId("share-slide-hero")).toBeEnabled();
  await page.getByTestId("share-slide-hero").click();
  await expect(page.getByTestId("share-canvas")).toBeVisible();
  const light = await bandHashes();
  if (evidenceDir) {
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("share-save").click(),
    ]);
    await dl.saveAs(join(evidenceDir, "light-session-normal-tone-card.png"));
  }
  expect(light.tagline).toBe(normal.tagline);
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
