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

  // Custom exercise linked to the machine, via the row's Edit sheet. The
  // created row is a published shared row (frozen — community phase,
  // docs/DECISIONS.md 2026-08-08), so fork a private copy and edit that.
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  await page.getByTestId(`exercise-row-toggle-${EX}`).click();
  await page.getByTestId(`fork-exercise-${EX}`).click();
  const copy = `${EX} (copy)`;
  await expect(page.getByTestId(`exercise-row-${copy}`)).toBeVisible();
  await waitForExercise(page, copy);
  await page.getByTestId(`exercise-row-toggle-${copy}`).click();
  await page.getByTestId(`edit-exercise-${copy}`).click();
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
      }, copy),
    )
    .not.toBeNull();

  // In a session, the machine chip identifies the machine (brand + model) —
  // per-machine settings (seat height etc.) are no longer editable or shown
  // from the session screen (session.tsx's own scope note: "the header chip
  // only attaches/swaps the machine now, Library still owns per-machine
  // setup"), so that stays a Library-only round-trip, checked separately
  // below rather than through the chip.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${copy}`).click();
  const chip = page.getByTestId("exercise-machine-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(MACHINE);

  // The setting itself still round-trips through Library, unrelated to the
  // in-session chip.
  await page.goto("/library");
  await page.getByTestId(`machine-row-${MACHINE}`).click();
  await page.getByTestId(`setting-value-${MACHINE}-Seat height`).fill("5");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByTestId(`machine-row-${MACHINE}`).click();
  await expect(
    page.getByTestId(`setting-value-${MACHINE}-Seat height`),
  ).toHaveValue("5");
});

// NEEDS-DECISION (implementation bug, reported separately): session.tsx's
// own header comment claims per-set notes/metrics/RIR-info "moved into the
// edit sheet a mark opens", but no such sheet exists — tapping a mark just
// re-shows the same weight/reps/RIR/RPE fields. `set-0-more` and
// `infotip-rir` have no surface anywhere in the new session screen. Left
// red, unresolved, pending that decision — not a testid this agent invented.
test("RIR InfoTip opens the lesson", async ({ page }) => {
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId("pick-exercise-Squat").click();
  await page.getByTestId("set-0-more").click();
  await page.getByTestId("infotip-rir").click();
  await expect(page.getByText("RIR — reps in reserve")).toBeVisible();
  await expect(page.getByText(/reps you could still do/i)).toBeVisible();
});

test("setup values each carry an optional photo (note 16)", async ({
  page,
}) => {
  const MACHINE = `Photo Row ${Date.now()}`;

  await page.goto("/library");
  // A custom machine avoids colliding with the catalog-row machine the
  // settings-memory test creates (same model name).
  await page.getByTestId("machine-name-input").fill(MACHINE);
  await page.getByTestId("add-machine-btn").click();
  await expect(page.getByTestId(`machine-row-${MACHINE}`)).toBeVisible();

  // Two settings, each with its own photo affordance.
  await page.getByTestId(`machine-row-${MACHINE}`).click();
  await page.getByTestId(`add-setting-${MACHINE}`).fill("Seat height");
  await page.getByTestId(`add-setting-${MACHINE}`).press("Enter");
  await page.getByTestId(`add-setting-${MACHINE}`).fill("Pad height");
  await page.getByTestId(`add-setting-${MACHINE}`).press("Enter");
  await expect(
    page.getByTestId(`setting-photo-${MACHINE}-Seat height`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`setting-photo-${MACHINE}-Pad height`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`setting-photo-img-${MACHINE}-Seat height`),
  ).toHaveCount(0);

  // Upload a photo to the Seat height setting — the thumbnail appears, and
  // the path lands in the machine's settings jsonb (same storage bucket as
  // the machine photo, per-setting key).
  await page
    .getByTestId(`setting-photo-input-${MACHINE}-Seat height`)
    .setInputFiles({
      name: "seat.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
  await expect(
    page.getByTestId(`setting-photo-img-${MACHINE}-Seat height`),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async (name) => {
        const { data } = await window.__frog.supabase
          .from("machines")
          .select("settings")
          .eq("name", name)
          .single();
        const settings = (data?.settings ?? []) as {
          label: string;
          photoPath?: string | null;
        }[];
        return (
          (settings.find((s) => s.label === "Seat height")?.photoPath ??
            null) !== null
        );
      }, MACHINE),
    )
    .toBe(true);
  // The untouched setting keeps no photo path.
  const hasPadPhoto = await page.evaluate(async (name) => {
    const { data } = await window.__frog.supabase
      .from("machines")
      .select("settings")
      .eq("name", name)
      .single();
    const settings = (data?.settings ?? []) as {
      label: string;
      photoPath?: string | null;
    }[];
    return settings.find((s) => s.label === "Pad height")?.photoPath;
  }, MACHINE);
  expect(hasPadPhoto).toBeUndefined();
});
