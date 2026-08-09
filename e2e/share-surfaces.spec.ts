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

// Seed ids of the globally-seeded conditions (seed-ids.ts). The strip test
// below records the Stress scale, NOT the Sleep input: the earlier
// conditions-metrics "stop tracking" test untracks Sleep for the shared
// seeded user (server-side), so relying on Sleep here would order-depend on
// that spec — Stress is the one default no spec ever untracks.
const STRESS_ID = "00000000-0000-4000-8000-0000000000a5";

// The share surfaces share-summary.spec.ts doesn't reach:
//
//  1. The exercise Records card on a reps-only type. `bodyweight_reps` has no
//     best_e1rm/heaviest_weight record at all, so the card's hero has to fall
//     back through the PR priority list (builders.ts) — a null card takes the
//     Share button with it and the whole surface silently disappears.
//  2. The Measurement card, which is gated: never auto-offered, and a confirm
//     step in front of the sheet *every* time (measures.tsx MeasurementShareGate).
//  3. The frame × ground matrix — one canvas layout engine, three shareable
//     frames × four grounds, all painting a full-resolution card.
//
// Set E2E_EVIDENCE_DIR to also dump the painted PNGs + sheet screenshots there.

const evidenceDir = process.env.E2E_EVIDENCE_DIR;
const evidence = (name: string) => join(evidenceDir as string, name);

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  if (evidenceDir) mkdirSync(evidenceDir, { recursive: true });
  await signIn(page);
  // Display kg so typed weights map 1:1 to the canonical store (app defaults lb).
  await page.evaluate(() => localStorage.setItem("unit", "kg"));
});

/** Full-resolution canvas with at least one opaque pixel — a download-only
 * check passes on a blank card. */
async function paintedSize(page: Page): Promise<string> {
  return page.getByTestId("share-canvas").evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d");
    if (!ctx || c.width < 1000) return "unpainted";
    const opaque = ctx.getImageData(20, 20, 1, 1).data[3] > 0;
    return opaque ? `${c.width}x${c.height}` : "transparent";
  });
}

async function saveCard(page: Page, name: string) {
  if (!evidenceDir) return;
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("share-save").click(),
  ]);
  await download.saveAs(evidence(name));
}

async function createTypedExercise(page: Page, name: string, label: string) {
  await page.goto("/library");
  await page.getByTestId("new-exercise-btn").click();
  await page.getByTestId("exercise-name-input").fill(name);
  await page.getByTestId("exercise-type-select").click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, name);
}

/** Logs one session of this exercise, one set per value, into the field
 * `field` ("reps" / "duration"), and saves it. */
async function logSession(
  page: Page,
  name: string,
  field: string,
  values: string[],
) {
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${name}`).click();
  for (const [i, value] of values.entries()) {
    await page.getByTestId(`set-${i}-${field}`).fill(value);
    await page.getByTestId(`set-${i}-done`).click();
    await expect(page.getByTestId(`committed-${i}-type`)).toBeVisible();
  }
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await expect(page.getByTestId("post-save-summary")).toBeVisible();
  await page.getByTestId("summary-dismiss").click();
}

test("a reps-only exercise keeps a Records share card that paints", async ({
  page,
}) => {
  const EX = `Pullup ${Date.now()}`;

  await createTypedExercise(page, EX, "Bodyweight reps");
  // Two sessions, four distinct rep counts: the card's hero takes the best
  // (14) and the support row is fed by the rest, with a two-point sparkline.
  await logSession(page, EX, "reps", ["12", "10"]);
  await logSession(page, EX, "reps", ["14", "8"]);

  await page.goto("/library");
  await page.getByTestId(`open-exercise-${EX}`).click();
  await expect(page.getByTestId("exercise-detail-name")).toHaveText(EX);

  // Records exist for this type — reps records only, no weight-based PR.
  await expect(page.getByTestId("record-best_set_reps")).toContainText("14");
  await expect(page.getByTestId("record-heaviest_weight")).toHaveCount(0);
  await expect(page.getByTestId("record-best_e1rm")).toHaveCount(0);

  // …so the Share button must still be there, and its card must paint.
  await page.getByTestId("records-share-btn").click();
  await expect(page.getByTestId("share-sheet")).toBeVisible();
  await expect.poll(() => paintedSize(page)).toBe("1080x1920");

  if (evidenceDir) {
    await page
      .getByTestId("share-sheet")
      .screenshot({ path: evidence("records-bodyweight-sheet.png") });
    await saveCard(page, "records-bodyweight-card.png");
    // The press-pose mascot (records/pr cards) on the 16:9 poster frame.
    await page.getByTestId("share-frame-landscape").click();
    await page.getByTestId("share-ground-dark").click();
    await expect.poll(() => paintedSize(page)).toBe("1080x608");
    await saveCard(page, "records-landscape-dark.png");
  }
});

test("a duration exercise's Records card paints a time support row", async ({
  page,
}) => {
  const EX = `Plank ${Date.now()}`;

  await createTypedExercise(page, EX, "Duration");
  await logSession(page, EX, "duration", ["1:00", "0:45"]);
  await logSession(page, EX, "duration", ["1:30", "0:30"]);

  await page.goto("/library");
  await page.getByTestId(`open-exercise-${EX}`).click();
  await expect(page.getByTestId("exercise-detail-name")).toHaveText(EX);
  await expect(page.getByTestId("record-best_time")).toContainText("1:30");

  await page.getByTestId("records-share-btn").click();
  await expect(page.getByTestId("share-sheet")).toBeVisible();
  await expect.poll(() => paintedSize(page)).toBe("1080x1920");

  if (evidenceDir) {
    await page
      .getByTestId("share-sheet")
      .screenshot({ path: evidence("records-duration-sheet.png") });
    await saveCard(page, "records-duration-card.png");
  }
});

test("measurement sharing is never auto-offered and confirms every time", async ({
  page,
}) => {
  await page.goto("/measures");
  // Dated after every other measurement fixture in the suite (measures.spec.ts's
  // latest is 2021-07-01) — trend-latest reflects the newest dated entry across
  // the whole shared seeded user, not just what this test just wrote.
  await page.getByTestId("measure-date").fill("2021-08-01");
  await page.getByTestId("measure-field-bodyweightKg").fill("82");
  await page.getByTestId("measure-field-bodyweightKg").blur();
  await expect(page.getByTestId("trend-latest")).toContainText("82");

  // Tapping Share opens a confirm, NOT the sheet.
  await page.getByTestId("measures-share-btn").click();
  await expect(page.getByText(/asks every time/i)).toBeVisible();
  await expect(page.getByTestId("share-sheet")).toHaveCount(0);
  if (evidenceDir) {
    await page.screenshot({ path: evidence("measurement-confirm.png") });
  }

  // Cancel keeps the sheet closed.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("share-sheet")).toHaveCount(0);

  // Continue opens it, and the card paints.
  await page.getByTestId("measures-share-btn").click();
  await page.getByTestId("measures-share-confirm").click();
  await expect(page.getByTestId("share-sheet")).toBeVisible();
  await expect.poll(() => paintedSize(page)).toBe("1080x1920");
  if (evidenceDir) {
    await page
      .getByTestId("share-sheet")
      .screenshot({ path: evidence("measurement-sheet.png") });
    await saveCard(page, "measurement-card.png");
  }

  // Every time: reopening asks again rather than remembering the consent.
  await page.getByTestId("share-close").click();
  await page.getByTestId("measures-share-btn").click();
  await expect(page.getByText(/asks every time/i)).toBeVisible();
  await expect(page.getByTestId("share-sheet")).toHaveCount(0);
});

test("one layout engine paints every frame × ground of a session card", async ({
  page,
}) => {
  const EX = `Matrix ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  for (const [i, [w, r]] of [
    ["100", "8"],
    ["120", "3"],
  ].entries()) {
    await page.getByTestId(`set-${i}-weight`).fill(w);
    await page.getByTestId(`set-${i}-reps`).fill(r);
    await page.getByTestId(`set-${i}-done`).click();
    await expect(page.getByTestId(`committed-${i}-type`)).toBeVisible();
  }
  // Record a condition so the card's lab-report strip has data to paint
  // (the strip only renders when the session recorded something). Stress is
  // used rather than Sleep — see the STRESS_ID comment above.
  await page.getByTestId("conditions-chip").click();
  const stress = page.getByTestId(`condition-scale-${STRESS_ID}-4`);
  await expect(stress).toBeVisible();
  await stress.click();
  await expect(page.getByTestId("conditions-chip")).toContainText("stress 4");
  await page.keyboard.press("Escape"); // close the conditions sheet
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await expect(page.getByTestId("post-save-summary")).toBeVisible();
  await page.getByTestId("summary-dismiss").click();

  await page.getByTestId("history-share-btn").click();
  await expect(page.getByTestId("share-sheet")).toBeVisible();

  // Headline set: defaults to the auto pick (the top set, 120 × 3), and
  // tapping a set chip re-headlines the card with that set instead (100 × 8).
  await page.getByTestId("share-hero-picker").scrollIntoViewIfNeeded();
  await expect.poll(() => paintedSize(page)).toBe("1080x1920");
  if (evidenceDir) {
    await page.screenshot({ path: evidence("session-sheet-hero-auto.png") });
    await saveCard(page, "session-story-hero-auto.png");
  }
  const setChip = page.getByTestId(/^share-hero-set-/).first();
  const autoChip = page.getByTestId("share-hero-auto");
  const autoBg = await autoChip.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await setChip.click();
  await expect.poll(() => paintedSize(page)).toBe("1080x1920");
  // The picked chip takes the selected treatment the Auto chip had, so the
  // sheet says which set is headlined without reading the canvas.
  await expect(setChip).toHaveCSS("background-color", autoBg);
  await expect(autoChip).not.toHaveCSS("background-color", autoBg);
  if (evidenceDir) {
    await page.screenshot({ path: evidence("session-sheet-hero-picked.png") });
    await saveCard(page, "session-story-hero-picked.png");
  }
  await page.getByTestId("share-hero-auto").click();

  const SIZES = {
    story: "1080x1920",
    post: "1080x1350",
    square: "1080x1080",
    landscape: "1080x608",
  };
  for (const [frame, size] of Object.entries(SIZES)) {
    await page.getByTestId(`share-frame-${frame}`).click();
    for (const ground of ["dark", "light", "green", "photo"]) {
      await page.getByTestId(`share-ground-${ground}`).click();
      // The Photo ground with no photo picked still paints a ground — it must
      // never leave a transparent (invisible) card behind.
      await expect.poll(() => paintedSize(page)).toBe(size);
      if (evidenceDir && frame === "story") {
        await saveCard(page, `session-story-${ground}.png`);
      }
    }
  }

  if (evidenceDir) {
    await page.getByTestId("share-frame-square").click();
    await page.getByTestId("share-ground-green").click();
    await expect.poll(() => paintedSize(page)).toBe(SIZES.square);
    await saveCard(page, "session-square-green.png");
    await page
      .getByTestId("share-sheet")
      .screenshot({ path: evidence("session-sheet-square-green.png") });
    // The new 16:9 poster frame, both mascot poses' cards, dark + photo:
    // the split layout is the frame this pass is about, so it gets its own
    // evidence set beyond the matrix loop above.
    await page.getByTestId("share-frame-landscape").click();
    await page.getByTestId("share-ground-dark").click();
    await expect.poll(() => paintedSize(page)).toBe(SIZES.landscape);
    await saveCard(page, "session-landscape-dark.png");
    await page.getByTestId("share-ground-photo").click();
    await expect.poll(() => paintedSize(page)).toBe(SIZES.landscape);
    await saveCard(page, "session-landscape-photo.png");
  }
});
