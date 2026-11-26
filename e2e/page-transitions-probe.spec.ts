// Page-transition evidence probe (not part of normal CI):
//   PAGES_PROBE=<before|after> bun scripts/run-e2e.ts page-transitions-probe.spec.ts
// At 390x844, animations slowed 10x through CDP so each frame shows where a
// transition is: a strip per transition type under
// docs/ux-audit/2026-11-25-r2/pages/probe-<label>/. Evidence for the
// 2026-11-25 "no animations between pages" pass (docs/DECISIONS.md).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

const LABEL = process.env.PAGES_PROBE ?? "";
test.skip(!LABEL, "page-transition audit only");
test.setTimeout(240_000);
test.use({ viewport: { width: 390, height: 844 } });

const OUT = join(
  __dirname,
  "../docs/ux-audit/2026-11-25-r2/pages",
  `probe-${LABEL}`,
);

/** Frames at fixed (real-time) offsets after an action; playback is 10x slow. */
async function burst(page: Page, name: string, offsets = [0, 300, 700, 1200]) {
  let last = 0;
  for (const ms of offsets) {
    await page.waitForTimeout(ms - last);
    last = ms;
    await page.screenshot({ path: join(OUT, `${name}-${ms}ms.png`) });
  }
  // let a slowed transition finish before the next step
  await page.waitForTimeout(2200 - last);
}

test("page transitions probe", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  mkdirSync(OUT, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
  await page.goto("/plan?s=library");
  await expect(
    page.locator('[data-testid^="open-exercise-"]').first(),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("home-hero")).toBeVisible();
  await page.waitForTimeout(1200);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });

  // 1. Tab switch Today -> Plan.
  await page.getByRole("link", { name: "Plan" }).last().click();
  await burst(page, "tab");
  // 2. Push: Library list -> exercise detail.
  await page
    .getByRole("radio", { name: "Library" })
    .or(page.getByRole("button", { name: "Library", exact: true }))
    .first()
    .click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid^="open-exercise-"]').first().click();
  await burst(page, "push");
  // 3. Back: the detail's back arrow (history back).
  await page.getByTestId("exercise-detail-back").click();
  await burst(page, "back");
  // 4. Session takeover in and out.
  await page.getByRole("link", { name: "Today" }).last().click();
  await page.waitForTimeout(2500);
  await page.getByTestId("start-session-btn").click();
  await burst(page, "session-in");
  await page.goBack();
  await burst(page, "session-out");
  // 5. Reduced motion: tab switch.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("link", { name: "Progress" }).last().click();
  await burst(page, "reduced-tab");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
});
