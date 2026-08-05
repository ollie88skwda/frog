import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
  waitForSetLogs,
} from "./helpers";

// Unilateral set logging: a set_logs.side column pairs two rows under one
// set_no. The session UI renders them as ONE set (ᴸ line you type into, ᴿ
// line mirroring as faint placeholders until overridden), committed by one
// tap — this is the fix for the double-counting bug (a unilateral set was
// reading as two sets everywhere: session header, finish sheet, stats).

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function cellX(
  page: import("@playwright/test").Page,
  testId: string,
  // The draft row's cells are Radix TextField roots: the test id lands on the
  // inner <input>, which the field's own 1px border insets from the grid cell
  // around it. Measure that wrapper when comparing against a committed cell.
  wrapper = false,
): Promise<number> {
  const el = page.getByTestId(testId);
  const box = await (wrapper ? el.locator("..") : el).boundingBox();
  if (!box) throw new Error(`${testId} has no bounding box`);
  return box.x;
}

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

test("logs a unilateral set as two rows sharing one set_no, and counts it once", async ({
  page,
}) => {
  const EX = `One-Arm Row ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  await markUnilateral(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Header shows "reps" (not "reps/side") — the ᴸ/ᴿ line markers already say
  // per-side (report's own resolved judgment call).
  const block = page.getByTestId(`block-${EX}`);
  await expect(block).toContainText("reps");
  await expect(block).not.toContainText("reps/side");

  // Draft row: ᴸ line you type into, ᴿ line mirrors live as you type.
  await expect(page.getByTestId("set-0-type")).toContainText("1ᴸ");
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
  await expect(page.getByTestId("set-0-right-weight")).toHaveValue("");

  await page.getByTestId("set-0-done").click();

  // ONE physical set, not two — the bug this feature fixes.
  await expect(page.getByTestId("session-stats")).toContainText("1 set");
  await expect(page.getByTestId("committed-0-type")).toContainText("1ᴸ");
  await expect(page.getByTestId("committed-0-right-weight")).toContainText(
    "30",
  );
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
    }, EX);

  await expect.poll(async () => (await readRows()).length).toBe(2);
  const rows = await readRows();
  // Both share set_no 0; an untouched ᴿ line mirrors the ᴸ values exactly.
  expect(rows[0].set_no).toBe(0);
  expect(rows[1].set_no).toBe(0);
  expect(rows[0].side).toBe("left");
  expect(rows[1].side).toBe("right");
  expect(rows[0].reps).toBe(10);
  expect(rows[1].reps).toBe(10);
  expect(rows[0].weight_kg).toBe(rows[1].weight_kg);
  expect(rows[0].rest_sec).toBeNull(); // first set of the session
  expect(rows[1].rest_sec).toBeNull(); // right side never carries rest_sec

  // Draft advances to physical set 2 (not 3) — the same countSets() the
  // header uses, not a raw committed.length.
  await expect(page.getByTestId("set-1-type")).toContainText("2ᴸ");

  // An uneven pair (override the ᴿ line) — volume sums both sides, and
  // rest_sec lands on the left row only (one commit, one countdown).
  await page.getByTestId("set-1-weight").fill("30");
  await page.getByTestId("set-1-reps").fill("10");
  await page.getByTestId("set-1-right-weight").fill("28");
  await page.getByTestId("set-1-right-reps").fill("8");
  await page.getByTestId("set-1-done").click();

  await expect(page.getByTestId("session-stats")).toContainText("2 sets");
  await expect(page.getByTestId("committed-1-right-weight")).toContainText(
    "28",
  );
  await expect(page.getByTestId("committed-1-right-reps")).toContainText("8");
});

test("shows the laterality affix alongside the warm-up marker on a unilateral pair's top line", async ({
  page,
}) => {
  const EX = `Warmup Row ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  await markUnilateral(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // The marker must still carry the ᴸ affix once a type is assigned — losing
  // it drops the pairing cue that ties this line to its ᴿ line below.
  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-warmup").click();
  await expect(page.getByTestId("set-0-type")).toHaveText("Wᴸ");

  await page.getByTestId("set-0-weight").fill("20");
  await page.getByTestId("set-0-reps").fill("12");
  await page.getByTestId("set-0-done").click();

  await expect(page.getByTestId("committed-0-type")).toHaveText("Wᴸ");
});

test("editing only the ᴿ row's RIR/RPE/note surfaces them in the collapsed readout and reopened sheet", async ({
  page,
}) => {
  const EX = `One-Arm Press ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  await markUnilateral(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await page.getByTestId("set-0-weight").fill("20");
  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-done").click();
  await expect(page.getByTestId("committed-0-right-weight")).toContainText(
    "20",
  );

  // Edit only the ᴿ row's details — the ᴸ row keeps no RIR/RPE/note.
  await page.getByTestId("committed-0-right-weight").click();
  await page.getByTestId("edit-0-rirmin").fill("1");
  await page.getByTestId("edit-0-rpe").selectOption("9");
  await page.getByTestId("edit-0-note").fill("elbow flare on this side");
  await page.getByTestId("edit-0-save").click();

  // Collapsed readout now surfaces the ᴿ row's own values.
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
  await expect(page.getByTestId("committed-0-effort")).toBeVisible();
  await expect(page.getByTestId("committed-0-note")).toHaveCount(0);

  // Reopening the ᴿ row's sheet still shows what was saved (it never was
  // truly invisible in storage — only in every UI surface, until now).
  await page.getByTestId("committed-0-right-weight").click();
  await expect(page.getByTestId("edit-0-rirmin")).toHaveValue("1");
  await expect(page.getByTestId("edit-0-rpe")).toHaveValue("9");
  await expect(page.getByTestId("edit-0-note")).toHaveValue(
    "elbow flare on this side",
  );
});

test("a mirrored pair prints no ᴿ readout; clearing the ᴿ side prints — beside the ᴸ values", async ({
  page,
}) => {
  const EX = `One-Arm Curl ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  await markUnilateral(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Weight only, so far — auto-checkoff (weight+reps both filled) hasn't
  // armed yet, so opening the details sheet next can't race it. Effort
  // entered here fans out to both rows at commit.
  await page.getByTestId("set-0-weight").fill("20");
  await page.getByTestId("set-0-more").click();
  await page.getByTestId("set-0-rirmin").fill("2");
  await page.getByTestId("set-0-rpe").selectOption("8");
  await expect(page.getByTestId("set-0-note")).toBeVisible(); // sheet is open
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("set-0-note")).toBeHidden();

  // The draft row's ᴸ line now carries a preview badge its ᴿ line doesn't.
  // Both lines size their columns from one grid, so the values stay
  // pixel-aligned anyway — the whole point of the shared track.
  await expect(page.getByTestId(`block-${EX}`)).toContainText("@2 RPE 8");
  expect(await cellX(page, "set-0-right-weight")).toBeCloseTo(
    await cellX(page, "set-0-weight"),
    0,
  );
  expect(await cellX(page, "set-0-right-reps")).toBeCloseTo(
    await cellX(page, "set-0-reps"),
    0,
  );

  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-done").click();

  // Both rows carry the same effort: the ᴿ line prints nothing at all, and
  // the ᴸ line's readout stays desktop-only chrome at this viewport (the
  // suite's iPhone 13 default, below `md:`).
  await expect(page.getByTestId("committed-0-right-weight")).toContainText(
    "20",
  );
  await expect(page.getByTestId("committed-0-right-effort")).toHaveCount(0);
  await expect(page.getByTestId("committed-0-effort")).toBeHidden();

  // Clear the ᴿ row's own effort — the two sides now differ, with nothing
  // left on the ᴿ one.
  await page.getByTestId("committed-0-right-weight").click();
  await page.getByTestId("edit-0-rirmin").fill("");
  await page.getByTestId("edit-0-rpe").selectOption("");
  await page.getByTestId("edit-0-save").click();

  // "—", not a blank span: cleared has to read differently from mirrored.
  await expect(page.getByTestId("committed-0-right-effort")).toHaveText("—");
  await expect(page.getByTestId("committed-0-right-effort")).toBeVisible();

  // …and the ᴸ line's own values come out of hiding on the same narrow
  // viewport, so the readout that IS there can't read as the whole set's.
  await expect(page.getByTestId("committed-0-effort")).toBeVisible();
  await expect(page.getByTestId("committed-0-effort")).toHaveText("@2 RPE 8");

  // One badge per line, of different widths — the committed pair's columns
  // still line up, because both lines share the row's own grid tracks.
  expect(await cellX(page, "committed-0-right-weight")).toBeCloseTo(
    await cellX(page, "committed-0-weight"),
    0,
  );
  expect(await cellX(page, "committed-0-right-reps")).toBeCloseTo(
    await cellX(page, "committed-0-reps"),
    0,
  );

  // …and it has to hold across the block, not just within the pair: log a
  // second, badge-free set. Every row of one exercise shares one grid, so the
  // widest badge in the block sizes the auto menu gutter once. Sized per row,
  // set 1's values would sit left of set 2's and of the draft row's.
  await page.getByTestId("set-1-weight").fill("20");
  await page.getByTestId("set-1-reps").fill("8");
  await page.getByTestId("set-1-done").click();
  await expect(page.getByTestId("committed-1-right-weight")).toContainText(
    "20",
  );

  const repsX = await cellX(page, "committed-0-reps");
  for (const [id, wrapper] of [
    ["committed-0-right-reps", false],
    ["committed-1-reps", false],
    ["committed-1-right-reps", false],
    ["set-2-reps", true],
  ] as const) {
    expect(
      await cellX(page, id, wrapper),
      `${id} vs committed-0-reps`,
    ).toBeCloseTo(repsX, 0);
  }

  // The ⋯ controls stay right-anchored inside that shared gutter: a row with
  // no badge must not float its button mid-track (same-size buttons, so the
  // left edge is enough to say so).
  const menuX = await cellX(page, "set-menu-0");
  for (const id of ["set-menu-1", "set-2-more"]) {
    expect(await cellX(page, id), `${id} vs set-menu-0`).toBeCloseTo(menuX, 0);
  }
});

test("alternating exercises log as a single row with a total-reps header", async ({
  page,
}) => {
  const EX = `Alt Curl ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  await page.evaluate(async (n) => {
    const { error } = await window.__frog.supabase
      .from("exercises")
      .update({ laterality: "alternating" })
      .eq("name", n);
    if (error) throw new Error(error.message);
  }, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const block = page.getByTestId(`block-${EX}`);
  await expect(block).toContainText("total reps");
  // No paired ᴿ line for alternating — it logs identically to bilateral.
  await expect(page.getByTestId("set-0-right-weight")).toHaveCount(0);
});

test("library last-set summary shows both sides of an uneven unilateral pair", async ({
  page,
}) => {
  // Display kg so the assertion below is unit-independent of the app's lb default.
  await page.evaluate(() => localStorage.setItem("unit", "kg"));

  const EX = `Lat Pulldown ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);
  await markUnilateral(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await page.getByTestId("set-0-weight").fill("40");
  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-right-weight").fill("35");
  await page.getByTestId("set-0-right-reps").fill("8");
  await page.getByTestId("set-0-done").click();
  await expect(page.getByTestId("committed-0-right-weight")).toContainText(
    "35",
  );
  await waitForSetLogs(page, EX, 2);

  // The library card's "Last:" ghost preview shares formatPrevious's uneven-
  // pair convention ("X × r / Y × r") with the session PREVIOUS column — it
  // must show the ᴿ side too, not silently drop it.
  await page.goto("/library");
  await page.getByTestId("exercise-search-input").fill(EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toContainText(
    "Last: 40 kg × 8 / 35 kg × 8",
  );
});
