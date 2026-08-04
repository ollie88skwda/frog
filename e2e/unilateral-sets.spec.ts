import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
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

  // The library card's "Last:" ghost preview shares formatPrevious's uneven-
  // pair convention ("X × r / Y × r") with the session PREVIOUS column — it
  // must show the ᴿ side too, not silently drop it.
  await page.goto("/library");
  await page.getByTestId("exercise-search-input").fill(EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toContainText(
    "Last: 40 kg × 8 / 35 kg × 8",
  );
});
