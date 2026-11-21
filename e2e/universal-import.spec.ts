import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Universal import (frog-import-uni): the one drop zone takes several files at
// once. Synthetic fixtures (scripts/universal/fixtures.ts, invented data):
// three overlapping scrolls of a numbered routine list stitch into ONE routine
// of 17 exercises; a "Share" table reads as ONE session of 10 exercises. An
// unknown layout falls back to the raw text box; an unsupported file is
// reported without blocking the rest. Nothing leaves the device before confirm.

const FIX = "packages/core/src/import/layout/fixtures";
const SHOTS = process.env.UNI_SHOTS;

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

/** Records third-party requests and large pre-confirm POSTs (uploads). */
function watchNetwork(page: Page) {
  const external: string[] = [];
  const uploads: string[] = [];
  const state = { confirmed: false };
  const origin = new URL(page.url()).origin;
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (
      /^https?:$/.test(u.protocol) &&
      u.origin !== origin &&
      !/convex|clerk/i.test(u.host) &&
      !/127\.0\.0\.1|localhost/.test(u.host)
    )
      external.push(r.url());
    if (
      !state.confirmed &&
      r.method() === "POST" &&
      (r.postData()?.length ?? 0) > 20_000
    )
      uploads.push(r.url());
  });
  return { external, uploads, state };
}

/** Real drag-and-drop: a DataTransfer of Files dispatched on the drop zone. */
async function dropFiles(
  page: Page,
  files: { name: string; mime: string; b64: string }[],
) {
  const dt = await page.evaluateHandle((fs) => {
    const d = new DataTransfer();
    for (const f of fs) {
      const bin = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
      d.items.add(new File([bin], f.name, { type: f.mime }));
    }
    return d;
  }, files);
  const zone = page.getByTestId("import-dropzone");
  await zone.dispatchEvent("dragover", { dataTransfer: dt });
  await zone.dispatchEvent("drop", { dataTransfer: dt });
}

const png = (id: string) => ({
  name: `${id}.png`,
  mime: "image/png",
  b64: readFileSync(`${FIX}/${id}.png`).toString("base64"),
});

async function shoot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test("three scrolled routine screenshots → one stitched routine, on-device", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const net = watchNetwork(page);
  await page.goto("/import");
  await shoot(page, "00-import-dropzone");
  await page
    .getByTestId("import-file-input")
    .setInputFiles([
      `${FIX}/routine-1.png`,
      `${FIX}/routine-2.png`,
      `${FIX}/routine-3.png`,
    ]);
  await expect(page.getByTestId("import-review")).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByTestId("review-counts")).toContainText(
    "0 sessions · 1 routines",
  );
  await expect(page.getByTestId("review-counts")).toContainText("17 exercises");
  const routine = page.getByTestId("review-routine");
  await expect(routine).toHaveCount(1);
  await expect(routine.getByLabel("Routine name")).toHaveValue("Push Pull");
  for (const n of [
    "Cable Crossover Fly",
    "Chest Supported Neutral Grip Machine Row",
    "Overhead Rope Cable Extension",
  ])
    await expect(routine).toContainText(n);
  await expect(page.getByText(/separate workouts merged/)).toHaveCount(0);
  await shoot(page, "01-routine-review");
  expect(net.uploads).toEqual([]);
  expect(net.external).toEqual([]);

  net.state.confirmed = true;
  await page.getByTestId("review-confirm").click();
  await expect(page.getByTestId("import-done")).toBeVisible({
    timeout: 20_000,
  });
  const saved = await page.evaluate(async () => {
    const { count } = await window.__frog.db
      .from("routines")
      .select("id", { count: "exact", head: true })
      .eq("name", "Push Pull");
    return count ?? 0;
  });
  expect(saved).toBeGreaterThanOrEqual(1);
  expect(net.external).toEqual([]);
});

test("dropped Share table + unsupported file → one session, problem reported", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const net = watchNetwork(page);
  await page.goto("/import");
  await dropFiles(page, [
    png("table"),
    {
      name: "plan.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      b64: Buffer.from("PK\u0003\u0004word/document.xml").toString("base64"),
    },
  ]);
  await expect(page.getByTestId("import-review")).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByTestId("review-counts")).toContainText(
    "1 sessions · 0 routines",
  );
  await expect(page.getByTestId("review-counts")).toContainText("10 exercises");
  await expect(page.getByTestId("review-session")).toContainText(
    "Wide Incline Machine Press",
  );
  // The skipped file is reported on the review screen, before confirm.
  await expect(page.getByTestId("import-error")).toContainText("plan.docx");
  await shoot(page, "02-table-review");
  expect(net.uploads).toEqual([]);
  expect(net.external).toEqual([]);
});

test("kg text log + lb screenshot → review says the lb workout was left out", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/import");
  await dropFiles(page, [
    {
      name: "log.txt",
      mime: "text/plain",
      b64: Buffer.from("Leg Day\nSquat\n100 kg x 5\n").toString("base64"),
    },
    png("table"),
  ]);
  await expect(page.getByTestId("import-review")).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByTestId("review-counts")).toContainText(
    "1 sessions · 0 routines",
  );
  await expect(page.getByTestId("import-error")).toContainText(
    "1 workout in lb were left out",
  );
  await shoot(page, "04-mixed-units-review");
});

test("unknown layout → raw text lands in the box for manual editing", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const net = watchNetwork(page);
  await page.goto("/import");
  // A shopping list rendered to PNG in the page: readable text, no workout.
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 600;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 900, 600);
    g.fillStyle = "#000";
    g.font = "bold 48px Arial";
    ["Groceries", "Milk and eggs", "Fresh bread", "Call the plumber"].forEach(
      (t, i) => {
        g.fillText(t, 60, 120 + i * 110);
      },
    );
    return c.toDataURL("image/png").split(",")[1];
  });
  await dropFiles(page, [{ name: "notes.png", mime: "image/png", b64 }]);
  await expect(page.getByTestId("import-error")).toContainText(
    /could not find sets|found no sets/,
    { timeout: 150_000 },
  );
  await expect(page.getByTestId("import-text")).toHaveValue(/bread/i);
  await expect(page.getByTestId("import-review")).toHaveCount(0);
  await shoot(page, "03-unknown-fallback");
  expect(net.uploads).toEqual([]);
  expect(net.external).toEqual([]);
});

// Dates in 2011 so no session the shared e2e account logs (other specs log
// relative to today) lands on the same day and gets switched off as a
// duplicate, which would change the review counts.
const GENERIC_CSV = {
  name: "lifts.csv",
  mime: "text/csv",
  b64: Buffer.from(
    "Day;Lift;Load;Repetitions;Comment\n03/11/2011;Squat;100;5;\n03/11/2011;Squat;100;5;felt heavy\n14/11/2011;Squat;102.5;5;\n",
  ).toString("base64"),
};

test("a lone generic CSV still offers column mapping", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/import");
  await dropFiles(page, [GENERIC_CSV]);
  await expect(page.getByTestId("import-review")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("import-mapping")).toBeVisible();
  await expect(page.getByTestId("review-counts")).toContainText("2 sessions");
  await shoot(page, "05-lone-csv-mapping");
});

test("generic CSV + routine screenshots → both kept, no column mapping that could wipe the routine", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const net = watchNetwork(page);
  await page.goto("/import");
  await dropFiles(page, [
    GENERIC_CSV,
    png("routine-1"),
    png("routine-2"),
    png("routine-3"),
  ]);
  await expect(page.getByTestId("import-review")).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByTestId("review-counts")).toContainText(
    "2 sessions · 1 routines",
  );
  await expect(page.getByTestId("review-routine")).toHaveCount(1);
  await expect(page.getByTestId("import-mapping")).toHaveCount(0);
  await shoot(page, "06-csv-plus-routine-review");
  expect(net.uploads).toEqual([]);
  expect(net.external).toEqual([]);
});
