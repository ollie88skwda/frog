// Brand QA sweep (not part of normal CI): QA_VISUAL=1 bun scripts/run-e2e.ts -- e2e/qa-visual.spec.ts
import { expect, type Page, test } from "@playwright/test";
import { auditBrand } from "./brand-audit";
import { EMAIL, PASSWORD, signInAs } from "./helpers";

test.skip(!process.env.QA_VISUAL, "QA only");
test.setTimeout(600_000);

// [screenshot name, path]; `:session`, `:exercise`, `:routine` and
// `:program` are filled from the signed-in user's data below.
const ROUTES: [string, string][] = [
  ["home", "/"],
  ["train", "/train"],
  ["session", "/session/:session"],
  ["history-detail", "/history/:session"],
  ["routines", "/routines"],
  ["routines-new", "/routines/new"],
  ["routine-edit", "/routines/:routine/edit"],
  ["programs", "/programs"],
  ["program-detail", "/programs/:program"],
  ["trainer", "/trainer"],
  ["profile", "/profile"],
  ["calendar", "/calendar"],
  ["library", "/library"],
  ["exercise-detail", "/exercises/:exercise"],
  ["history", "/history"],
  ["findings", "/findings"],
  ["measures", "/measures"],
  ["stats", "/stats"],
  ["stats-monthly", "/stats/monthly"],
  ["stats-year", "/stats/year"],
  ["settings", "/settings"],
  ["tips", "/tips"],
  ["changelog", "/changelog"],
  ["not-found", "/nope-404"],
  ["auth", "/auth"],
];

async function seedIds(page: Page): Promise<Record<string, string>> {
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await page.waitForURL(/\/session\//);
  const session = new URL(page.url()).pathname.split("/")[2];
  await page.goto("/programs");
  await page.getByTestId("more-templates").click();
  const program = (
    await page
      .locator('[data-testid^="program-card-"]')
      .first()
      .getAttribute("data-testid")
  )?.replace("program-card-", "");
  const { exercise, routine } = await page.evaluate(async () => {
    const db = window.__frog.db;
    const ex = await db.from("exercises").select("id").limit(1);
    if (ex.error) throw new Error(ex.error.message);
    const { data: u } = await db.auth.getUser();
    const now = Date.now();
    const id = crypto.randomUUID();
    const r = await db.from("routines").insert({
      id,
      created_at: now,
      updated_at: now,
      owner_id: u.user.id,
      name: "QA routine",
      folder_id: null,
      position: 0,
      description: null,
    });
    if (r.error) throw new Error(r.error.message);
    return { exercise: ex.data?.[0]?.id as string, routine: id };
  });
  if (!program || !exercise) throw new Error("QA sweep: missing seed ids");
  return { session, exercise, routine, program };
}

for (const [vp, w, h] of [
  ["mobile", 390, 844],
  ["desktop", 1440, 900],
] as const)
  for (const mode of ["day", "night"] as const)
    test(`qa ${vp} ${mode}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: vp === "mobile",
      });
      const page = await ctx.newPage();
      await page.addInitScript((m) => localStorage.setItem("mode", m), mode);
      await signInAs(page, PASSWORD, EMAIL);
      const ids = await seedIds(page);
      for (const [name, route] of ROUTES) {
        const path = route.replace(/:(\w+)/g, (_, k: string) => ids[k]);
        if (name === "auth") await page.evaluate(() => window.__frog.signOut());
        await page.goto(path);
        await page.waitForTimeout(1200);
        const a = await auditBrand(page);
        expect.soft(a.mode, `${name} mode`).toBe(mode);
        expect.soft(a.overflowX, `${name} horizontal overflow`).toBe(false);
        expect.soft(a.lucideIcons, `${name} lucide icons`).toBe(0);
        expect
          .soft(
            a.fonts.filter((f) => f !== "Geologica"),
            `${name} fonts`,
          )
          .toEqual([]);
        expect.soft(a.badRadii, `${name} off-scale radii`).toEqual([]);
        expect.soft(a.lines, `${name} lines`).toEqual([]);
        await page.screenshot({
          path: `docs/brand/qa/${vp}-${mode}-${name}.jpg`,
          type: "jpeg",
          quality: 40,
          fullPage: false,
        });
      }
      await ctx.close();
    });
