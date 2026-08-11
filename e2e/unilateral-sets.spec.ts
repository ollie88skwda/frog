import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  pullUpLogger,
  signIn,
  waitForExercise,
  waitForSetLogs,
} from "./helpers";

// Unilateral logging (redesign R2). The data model is unchanged — a unilateral
// set is TWO `set_logs` rows sharing one `set_no`, distinguished by `side`.
// What changed is the control: the logger carries a visible four-state
// ToggleGroup (BOTH · L · R · L+R) on every set, so a unilateral set and a
// bilateral set of the SAME exercise in the same session are each one tap.
// L+R expands two labelled ᴸ/ᴿ panels with an explicit same-weight link; the
// committed pair renders in the ledger as ONE row with ᴸ/ᴿ chips.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function markUnilateral(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.evaluate(async (n) => {
    const { error } = await window.__frog.supabase
      .from("exercises")
      .update({ laterality: "unilateral" })
      .eq("name", n);
    if (error) throw new Error(error.message);
  }, name);
}

// Community phase (docs/DECISIONS.md 2026-08-08): an exercise created via the
// library is published as a shared row (owner_id null) and is RLS-immutable —
// a direct update on it is silently blocked. Fork a private copy (the
// library's "Make a private copy") and return its name, so the tests below
// can mutate an owned row instead.
async function forkCopy(
  page: import("@playwright/test").Page,
  name: string,
): Promise<string> {
  const copy = `${name} (copy)`;
  await page.getByTestId(`exercise-row-toggle-${name}`).click();
  await page.getByTestId(`fork-exercise-${name}`).click();
  await expect(page.getByTestId(`exercise-row-${copy}`)).toBeVisible();
  await waitForExercise(page, copy);
  return copy;
}

test("logs a unilateral set as two rows sharing one set_no, and counts it once", async ({
  page,
}) => {
  const EX = `One-Arm Row ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  const copy = await forkCopy(page, EX);
  await markUnilateral(page, copy);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${copy}`).click();

  // The exercise's own laterality seeds the toggle at L+R, which expands the
  // two labelled panels. The ᴿ weight mirrors the ᴸ one while linked.
  await pullUpLogger(page);
  await expect(page.getByTestId("set-0-lat-pair")).toHaveAttribute(
    "data-state",
    "on",
  );
  await expect(page.getByTestId("set-0-panel-left")).toContainText("LEFT");
  await expect(page.getByTestId("set-0-panel-right")).toContainText("RIGHT");
  await expect(page.getByTestId("set-0-link-weight")).toHaveAttribute(
    "data-state",
    "on",
  );

  await page.getByTestId("set-0-weight").fill("30");
  await page.getByTestId("set-0-reps").fill("10");
  await expect(page.getByTestId("set-0-right-weight")).toHaveAttribute(
    "placeholder",
    "30",
  );
  await expect(page.getByTestId("set-0-right-reps")).toHaveAttribute(
    "placeholder",
    "10",
  );
  // Untouched — mirroring is a placeholder, not a value.
  await expect(page.getByTestId("set-0-right-reps")).toHaveValue("");

  await page.getByTestId("set-0-add").click();

  // ONE physical set, not two — the bug this feature fixes.
  await expect(page.getByTestId("session-stats")).toContainText("1 set");
  // One ledger row, carrying both sides as ᴸ/ᴿ chips.
  await expect(page.getByTestId("committed-0-side-left")).toBeVisible();
  await expect(page.getByTestId("committed-0-side-right")).toBeVisible();
  await expect(page.getByTestId("committed-1")).toHaveCount(0);
  await expect(page.getByTestId("committed-0-right-reps")).toContainText("10");

  // Both rows share one set_no. The two upserts run in the background behind
  // the optimistic UI, so poll until they land instead of reading once.
  const readRows = () =>
    page.evaluate(async (n) => {
      const { data: ex } = await window.__frog.supabase
        .from("exercises")
        .select("id")
        .eq("name", n)
        .single();
      const { data, error } = await window.__frog.supabase
        .from("set_logs")
        .select("set_no, side, weight_kg, reps, rest_sec")
        .eq(
          "session_exercise_id",
          (
            await window.__frog.supabase
              .from("session_exercises")
              .select("id")
              .eq("exercise_id", ex.id)
              .single()
          ).data.id,
        )
        .order("side");
      if (error) throw new Error(error.message);
      return data;
    }, copy);

  await expect.poll(async () => (await readRows()).length).toBe(2);
  const rows = await readRows();
  expect(rows[0].set_no).toBe(0);
  expect(rows[1].set_no).toBe(0);
  expect(rows[0].side).toBe("left");
  expect(rows[1].side).toBe("right");
  expect(rows[0].reps).toBe(10);
  expect(rows[1].reps).toBe(10);
  expect(rows[0].weight_kg).toBe(rows[1].weight_kg);
  expect(rows[1].rest_sec).toBeNull(); // right side never carries rest_sec

  // Set 2, same exercise, divergent reps between the sides.
  await pullUpLogger(page);
  await page.getByTestId("set-1-weight").fill("30");
  await page.getByTestId("set-1-reps").fill("10");
  await page.getByTestId("set-1-right-reps").fill("8");
  await page.getByTestId("set-1-add").click();

  await expect(page.getByTestId("session-stats")).toContainText("2 sets");
  await expect(page.getByTestId("committed-1-right-reps")).toContainText("8");
});

test("BOTH and L+R mix freely inside one exercise, one tap each way", async ({
  page,
}) => {
  // R2's core claim. A plain bilateral exercise: set 1 goes unilateral with a
  // single tap on the toggle, and set 2 comes straight back to bilateral with
  // a single tap — no mode, no per-set sheet, no exercise-level switch.
  const EX = `Mixable ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Default: BOTH — no ᴿ panel at all.
  await pullUpLogger(page);
  await expect(page.getByTestId("set-0-lat-both")).toHaveAttribute(
    "data-state",
    "on",
  );
  await expect(page.getByTestId("set-0-right-reps")).toHaveCount(0);

  // One tap → L+R.
  await page.getByTestId("set-0-lat-pair").click();
  await expect(page.getByTestId("set-0-right-reps")).toBeVisible();
  await page.getByTestId("set-0-weight").fill("20");
  await page.getByTestId("set-0-reps").fill("10");
  await page.getByTestId("set-0-right-reps").fill("8");
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId("committed-0-side-right")).toBeVisible();
  await waitForSetLogs(page, EX, 2);

  // The next set starts back at BOTH — the override lived on that one set.
  await pullUpLogger(page);
  await expect(page.getByTestId("set-1-lat-both")).toHaveAttribute(
    "data-state",
    "on",
  );
  await expect(page.getByTestId("set-1-right-reps")).toHaveCount(0);
  await page.getByTestId("set-1-weight").fill("20");
  await page.getByTestId("set-1-reps").fill("10");
  await page.getByTestId("set-1-add").click();
  await expect(page.getByTestId("committed-1-side-right")).toHaveCount(0);
  await expect(page.getByTestId("session-stats")).toContainText("2 sets");
});

test("unlinking same-weight logs a heavier left than right", async ({
  page,
}) => {
  // The link is on by default (the symmetric case is one entry); unlinking is
  // the explicit escape hatch for a genuinely uneven pair.
  const EX = `Unlinked ${Date.now()}`;
  await page.evaluate(() => localStorage.setItem("unit", "kg"));

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await pullUpLogger(page);
  await page.getByTestId("set-0-lat-pair").click();
  await page.getByTestId("set-0-weight").fill("40");
  await page.getByTestId("set-0-reps").fill("8");
  // While linked the ᴿ weight is read-only and shows the ᴸ value as a hint.
  await expect(page.getByTestId("set-0-right-weight")).toHaveAttribute(
    "readonly",
    "",
  );
  await page.getByTestId("set-0-link-weight").click();
  await page.getByTestId("set-0-right-weight").fill("35");
  await page.getByTestId("set-0-add").click();

  await expect(page.getByTestId("committed-0-weight")).toHaveText("40");
  await expect(page.getByTestId("committed-0-right-weight")).toHaveText("35");
  await waitForSetLogs(page, EX, 2);
});

test("a single-sided set logs one row on that side", async ({ page }) => {
  // L (or R) alone: one set_logs row carrying that side — the "I only did the
  // left today" case the old two-line draft could not express at all.
  const EX = `Left Only ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await pullUpLogger(page);
  await page.getByTestId("set-0-lat-left").click();
  await page.getByTestId("set-0-weight").fill("25");
  await page.getByTestId("set-0-reps").fill("12");
  await page.getByTestId("set-0-add").click();

  await expect(page.getByTestId("committed-0-side-left")).toBeVisible();
  await expect(page.getByTestId("committed-0-side-right")).toHaveCount(0);
  await expect(page.getByTestId("session-stats")).toContainText("1 set");
  await waitForSetLogs(page, EX, 1);
});

test("a warm-up pair keeps its W marker in the ledger", async ({ page }) => {
  const EX = `Warmup Row ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  const copy = await forkCopy(page, EX);
  await markUnilateral(page, copy);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${copy}`).click();

  await pullUpLogger(page);
  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-warmup").click();
  await expect(page.getByTestId("set-0-type")).toHaveText("W");

  await page.getByTestId("set-0-weight").fill("20");
  await page.getByTestId("set-0-reps").fill("12");
  await page.getByTestId("set-0-add").click();

  await expect(page.getByTestId("committed-0-type")).toHaveText("W");
  await expect(page.getByTestId("committed-0-side-right")).toBeVisible();
});

test("editing only the ᴿ row's RIR/RPE/note surfaces them on that limb", async ({
  page,
}) => {
  const EX = `One-Arm Press ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  const copy = await forkCopy(page, EX);
  await markUnilateral(page, copy);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${copy}`).click();

  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("20");
  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-add").click();

  // Each limb's own cells open that limb's own details sheet.
  await page.getByTestId("committed-0-right-reps").click();
  await page.getByTestId("edit-0-rirmin").fill("1");
  await page.getByTestId("edit-0-rpe").selectOption("9");
  await page.getByTestId("edit-0-note").fill("elbow flare on this side");
  await page.getByTestId("edit-0-save").click();

  await expect(page.getByTestId("committed-0-right-effort")).toContainText(
    "@1",
  );
  await expect(page.getByTestId("committed-0-right-effort")).toContainText(
    "RPE 9",
  );
  await expect(page.getByTestId("committed-0-right-note")).toHaveAttribute(
    "title",
    "elbow flare on this side",
  );

  // Nothing fanned back to the ᴸ row — and it says so with a "—" rather
  // than a blank span, which would read as "this line mirrors the other".
  await expect(page.getByTestId("committed-0-effort")).toHaveText("—");

  // Reopening the ᴿ row's sheet still shows what was saved.
  await page.getByTestId("committed-0-right-reps").click();
  await expect(page.getByTestId("edit-0-rirmin")).toHaveValue("1");
  await expect(page.getByTestId("edit-0-rpe")).toHaveValue("9");
  await expect(page.getByTestId("edit-0-note")).toHaveValue(
    "elbow flare on this side",
  );
});

test("a mirrored pair prints no ᴿ readout; clearing the ᴿ side prints —", async ({
  page,
}) => {
  const EX = `One-Arm Curl ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  const copy = await forkCopy(page, EX);
  await markUnilateral(page, copy);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${copy}`).click();

  // Effort entered on the logger's details sheet fans out to both rows at
  // commit — the symmetric case stays one entry.
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("20");
  await page.getByTestId("set-0-more").click();
  await page.getByTestId("set-0-rirmin").fill("2");
  await page.getByTestId("set-0-rpe").selectOption("8");
  await expect(page.getByTestId("set-0-note")).toBeVisible(); // sheet is open
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("set-0-note")).toBeHidden();

  // The logger shows what the sheet is holding, without opening it.
  await expect(page.getByTestId("set-0-effort")).toHaveText("@2 RPE 8");

  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-add").click();

  // Both rows carry the same effort: the ᴿ limb prints nothing at all.
  await expect(page.getByTestId("committed-0-effort")).toHaveText("@2 RPE 8");
  await expect(page.getByTestId("committed-0-right-effort")).toHaveCount(0);

  // Clear the ᴿ row's own effort — the two sides now differ, with nothing
  // left on the ᴿ one.
  await page.getByTestId("committed-0-right-reps").click();
  await page.getByTestId("edit-0-rirmin").fill("");
  await page.getByTestId("edit-0-rpe").selectOption("");
  await page.getByTestId("edit-0-save").click();

  // "—", not a blank span: cleared has to read differently from mirrored.
  await expect(page.getByTestId("committed-0-right-effort")).toHaveText("—");
});

test("a legacy alternating exercise reads as bilateral (note 5)", async ({
  page,
}) => {
  const EX = `Alt Curl ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  const copy = await forkCopy(page, EX);
  await page.evaluate(async (n) => {
    const { error } = await window.__frog.supabase
      .from("exercises")
      .update({ laterality: "alternating" })
      .eq("name", n);
    if (error) throw new Error(error.message);
  }, copy);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${copy}`).click();

  // Alternating was folded into bilateral (note 5) — a legacy row logs
  // exactly like a bilateral one, and the per-set toggle is still offered.
  await pullUpLogger(page);
  await expect(page.getByTestId("set-0-lat-both")).toHaveAttribute(
    "data-state",
    "on",
  );
  await expect(page.getByTestId("set-0-right-reps")).toHaveCount(0);
  await expect(page.getByTestId("set-0-lat-pair")).toBeVisible();
});

test("laterality menu speaks unilateral/bilateral, not sides (note 15)", async ({
  page,
}) => {
  const EX = `Wording Bench ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await page.getByTestId(`block-${EX}-menu`).click();
  const menu = page.getByTestId(`block-${EX}-menu-popup`);
  await expect(menu).toContainText("Laterality");
  await expect(menu).toContainText("Unilateral");
  await expect(menu).toContainText("Bilateral");
  await expect(menu).not.toContainText("Alternating");
  await expect(menu).toContainText("one row per set");
  await expect(menu).toContainText("logged separately");
  await page.keyboard.press("Escape");
});

test("library last-set summary shows both sides of a divergent unilateral pair", async ({
  page,
}) => {
  // Display kg so the assertion below is unit-independent of the app's lb default.
  await page.evaluate(() => localStorage.setItem("unit", "kg"));

  const EX = `Lat Pulldown ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  const copy = await forkCopy(page, EX);
  await markUnilateral(page, copy);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${copy}`).click();

  // Unlinked weights AND divergent reps, straight from the logger.
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("40");
  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-link-weight").click();
  await page.getByTestId("set-0-right-weight").fill("35");
  await page.getByTestId("set-0-right-reps").fill("12");
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId("committed-0-right-reps")).toContainText("12");
  await waitForSetLogs(page, copy, 2);

  // The library card's "Last:" ghost preview shares formatPrevious's uneven-
  // pair convention ("X × r / Y × r") with the logger's LAST reference line —
  // it must show the ᴿ side too, not silently drop it.
  await page.goto("/library");
  await page.getByTestId("exercise-search-input").fill(copy);
  await expect(page.getByTestId(`exercise-row-${copy}`)).toContainText(
    "Last: 40 kg × 8 / 35 kg × 12",
  );
});

test("the committed set's ⋯ flips the set to unilateral and back (note 7)", async ({
  page,
}) => {
  const EX = `Committed Toggle ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Log one bilateral set.
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("30");
  await page.getByTestId("set-0-reps").fill("10");
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("committed-0-side-right")).toHaveCount(0);
  await waitForSetLogs(page, EX, 1);

  // Non-deleted row count (the toggle's remove is a soft delete, so the raw
  // set_logs count would keep the ᴿ row forever).
  const liveRows = () =>
    page.evaluate(async (n) => {
      const { data: ex } = await window.__frog.supabase
        .from("exercises")
        .select("id")
        .eq("name", n)
        .single();
      const { data: ses } = await window.__frog.supabase
        .from("session_exercises")
        .select("id")
        .eq("exercise_id", ex.id);
      const { count } = await window.__frog.supabase
        .from("set_logs")
        .select("id", { count: "exact", head: true })
        .in(
          "session_exercise_id",
          ses.map((s) => s.id),
        )
        .is("deleted_at", null);
      return count ?? 0;
    }, EX);

  // The ⋯ → details sheet carries the unilateral toggle; flipping it adds
  // the paired ᴿ row mirroring the ᴸ values — nothing else changes.
  await page.getByTestId("set-menu-0").click();
  await expect(page.getByTestId("set-menu-0-unilateral")).toBeVisible();
  await page.getByTestId("set-menu-0-unilateral").check();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("committed-0-right-reps")).toContainText("10");
  await expect.poll(liveRows).toBe(2);

  // The flip is structural: the ᴸ row's side went null → 'left' server-side,
  // so the pair survives a reload instead of re-splitting into two sets.
  await page.reload();
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("committed-0-right-reps")).toContainText("10");
  await expect(page.getByTestId("committed-1")).toHaveCount(0);

  // Flip it back — the ᴿ row is soft-deleted and the set is one row again.
  await page.getByTestId("set-menu-0").click();
  await expect(page.getByTestId("set-menu-0-unilateral")).toBeVisible();
  await page.getByTestId("set-menu-0-unilateral").uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("committed-0-side-right")).toHaveCount(0);
  await expect.poll(liveRows).toBe(1);

  // And the restore persisted too.
  await page.reload();
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("committed-0-side-right")).toHaveCount(0);
  await expect.poll(liveRows).toBe(1);
});

test("Log set stays disabled until something is filled", async ({ page }) => {
  // The old grid let "Add set" pre-create a blank committed row. The logger
  // has no such thing: an empty set is not a set, and the button says so
  // rather than writing a placeholder row nobody asked for.
  const EX = `Blank Add ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await pullUpLogger(page);
  await expect(page.getByTestId("set-0-add")).toBeDisabled();
  await page.getByTestId("set-0-weight").fill("50");
  await expect(page.getByTestId("set-0-add")).toBeEnabled();
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId("committed-0-weight")).toHaveText("50");
  await expect(page.getByTestId("committed-0-reps")).toHaveText("5");
});
