import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Measures (M7): body-measurement entry editor (backdate, any subset, one
// entry/day upsert), hand-rolled trend chart + metric list, and the progress
// photo lifecycle — upload, compare, replace, and the two delete paths
// (photo-only entry drops the row; an entry with data keeps it, photo cleared).

// A small truecolor-RGB PNG — createImageBitmap decodes it and the resize path
// re-encodes it to JPEG in the real browser, exercising the upload end-to-end.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4oaGBFTEMLQkAgl1GAWqNFmsAAAAASUVORK5CYII=",
  "base64",
);

// The measurement row for a local date, or null once soft-deleted (the query
// filters deleted_at, mirroring listMeasurements).
function measurement(page: Page, date: string) {
  return page.evaluate(async (d) => {
    const { data, error } = await window.__frog.supabase
      .from("measurements")
      .select("bodyweight_kg, photo_path")
      .eq("measured_on", d)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { bodyweight_kg: number | null; photo_path: string | null } | null;
  }, date);
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
  // Weights display 1:1 with the canonical kg store — keeps assertions unit-free
  // (the app defaults to lb).
  await page.evaluate(() => localStorage.setItem("unit", "kg"));
});

test("log body weight: entry persists, trend + list update, backdating adds a point", async ({
  page,
}) => {
  await page.goto("/measures");

  // Newest day: 80 kg.
  await page.getByTestId("measure-date").fill("2021-03-10");
  await page.getByTestId("measure-field-bodyweightKg").fill("80");
  await page.getByTestId("measure-field-bodyweightKg").blur();
  await expect
    .poll(() => measurement(page, "2021-03-10").then((m) => m?.bodyweight_kg ?? null))
    .toBe(80);

  // Row + latest reflect it immediately.
  await expect(page.getByTestId("measure-row-2021-03-10")).toBeVisible();
  await expect(page.getByTestId("trend-latest")).toContainText("80");

  // Backdate an earlier, lighter day → a second series point (polyline appears).
  await page.getByTestId("measure-date").fill("2021-03-01");
  await page.getByTestId("measure-field-bodyweightKg").fill("75");
  await page.getByTestId("measure-field-bodyweightKg").blur();
  await expect
    .poll(() => measurement(page, "2021-03-01").then((m) => m?.bodyweight_kg ?? null))
    .toBe(75);
  await expect(page.getByTestId("measure-row-2021-03-01")).toBeVisible();
  await expect(page.getByTestId("trend-chart").locator("polyline")).toBeVisible();

  // Latest stays the most recent day, not the last-edited one.
  await expect(page.getByTestId("trend-latest")).toContainText("80");

  // Tapping a list row loads that day back into the editor for editing.
  await page.getByTestId("measure-row-2021-03-10").getByRole("button").first().click();
  await expect(page.getByTestId("measure-date")).toHaveValue("2021-03-10");
  await expect(page.getByTestId("measure-field-bodyweightKg")).toHaveValue("80");
});

test("edit a value in place, then delete an entry with confirm", async ({
  page,
}) => {
  await page.goto("/measures");

  // A girth entry (stored + shown in cm regardless of the weight unit).
  await page.getByTestId("measure-date").fill("2021-05-20");
  await page.getByTestId("metric-chip-waistCm").click();
  await page.getByTestId("measure-field-waistCm").fill("82");
  await page.getByTestId("measure-field-waistCm").blur();
  await expect(page.getByTestId("measure-row-2021-05-20")).toBeVisible();
  await expect(page.getByTestId("trend-latest")).toContainText("82");

  // Edit in place — re-blur commits the new value (upsert merges the field).
  await page.getByTestId("measure-field-waistCm").fill("81");
  await page.getByTestId("measure-field-waistCm").blur();
  await expect(page.getByTestId("trend-latest")).toContainText("81");

  // Delete with inline confirm → row gone from the list and soft-deleted server-side.
  await page.getByTestId("measure-delete-2021-05-20").click();
  await page.getByTestId("measure-delete-confirm-2021-05-20").click();
  await expect(page.getByTestId("measure-row-2021-05-20")).toHaveCount(0);
  await expect.poll(() => measurement(page, "2021-05-20")).toBeNull();
});

test("progress photos: upload, compare, replace, and the two delete paths", async ({
  page,
}) => {
  await page.goto("/measures");

  // Day A carries a photo AND a body weight. Attach the photo to the empty day
  // first: that path creates the row via the awaited server insert, so the
  // upload targets the real id (the bodyweight upsert is keyed by date, not id).
  await page.getByTestId("measure-date").fill("2021-07-01");
  await page.getByTestId("measure-photo-input").setInputFiles({
    name: "a.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect
    .poll(() => measurement(page, "2021-07-01").then((m) => m?.photo_path ?? null))
    .not.toBeNull();
  await expect(page.getByTestId("photo-thumb-2021-07-01")).toBeVisible();
  await page.getByTestId("measure-field-bodyweightKg").fill("78");
  await page.getByTestId("measure-field-bodyweightKg").blur();
  await expect
    .poll(() => measurement(page, "2021-07-01").then((m) => m?.bodyweight_kg ?? null))
    .toBe(78);

  // Day B is photo-only (no measurements).
  await page.getByTestId("measure-date").fill("2021-06-01");
  await page.getByTestId("measure-photo-input").setInputFiles({
    name: "b.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect
    .poll(() => measurement(page, "2021-06-01").then((m) => m?.photo_path ?? null))
    .not.toBeNull();
  await expect(page.getByTestId("photo-thumb-2021-06-01")).toBeVisible();

  // Open A's viewer and compare it side-by-side with B → two figures.
  await page.getByTestId("photo-thumb-2021-07-01").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("figure")).toHaveCount(1);
  // Radix Select: open the trigger, pick the first real comparison (after None).
  await page.getByTestId("photo-compare-select").click();
  await page.getByRole("option").nth(1).click();
  await expect(dialog.locator("figure")).toHaveCount(2);

  // Replace A's photo — the object is overwritten in place, path stays set.
  await page.getByTestId("photo-replace-input").setInputFiles({
    name: "a2.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect
    .poll(() => measurement(page, "2021-07-01").then((m) => m?.photo_path ?? null))
    .not.toBeNull();

  // Delete A's photo: A has data, so the copy says measurements are kept and the
  // row survives with photo_path cleared.
  await page.getByTestId("photo-delete").click();
  await expect(dialog.getByText(/measurements are kept/i)).toBeVisible();
  await page.getByTestId("photo-delete-confirm").click();
  await expect(page.getByTestId("photo-thumb-2021-07-01")).toHaveCount(0);
  await expect
    .poll(() => measurement(page, "2021-07-01").then((m) => m?.photo_path ?? null))
    .toBeNull();
  // The row itself survives, measurements intact.
  await expect(
    measurement(page, "2021-07-01").then((m) => m?.bodyweight_kg ?? null),
  ).resolves.toBe(78);

  // Delete B's photo: photo-only, so the whole entry is removed.
  await page.getByTestId("photo-thumb-2021-06-01").click();
  await page.getByTestId("photo-delete").click();
  await expect(dialog.getByText(/photo-only/i)).toBeVisible();
  await page.getByTestId("photo-delete-confirm").click();
  await expect(page.getByTestId("photo-thumb-2021-06-01")).toHaveCount(0);
  await expect.poll(() => measurement(page, "2021-06-01")).toBeNull();
});
