import { expect, type Page, test } from "@playwright/test";
import { pullUpLogger, signIn } from "./helpers";

// /tips browse screen: reachable from the ⌘K palette and from Settings (the
// keyboard-free path), renders every LESSONS entry, and browsing marks lessons
// seen (clears the InfoTip dot elsewhere).

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

// Optional screenshot capture for review evidence (set E2E_SHOTS to a dir).
async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS;
  if (!dir) return;
  await page.waitForTimeout(250); // let 100–150ms UI transitions settle
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test("/tips lists lessons and browsing clears the InfoTip dot", async ({
  page,
}) => {
  // Fresh user → the RIR lesson is unseen. Surface its InfoTip in a session.
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId("pick-exercise-Squat").click();
  await pullUpLogger(page);
  await page.getByTestId("set-0-more").click();
  const tip = page.getByTestId("infotip-rir");
  await expect(tip).toBeVisible();
  await expect(tip.locator("span.bg-accent")).toBeVisible(); // unseen dot
  await shot(page, "1-session-infotip-unseen-dot");

  // ⌘K palette → "Training tips" → /tips. Wait for the item list to be
  // registered (cmdk registers items a frame after the dialog mounts) before
  // typing the query, so the filter doesn't race the mount.
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByPlaceholder("Type a command…");
  await expect(palette).toBeVisible();
  await expect(page.getByRole("option", { name: "Home" })).toBeVisible();
  await palette.fill("tips");
  const item = page.getByRole("option", { name: "Training tips" });
  await expect(item).toBeVisible();
  await shot(page, "2-palette-training-tips");
  await item.click();
  await expect(page).toHaveURL(/\/tips$/);

  // The browse screen renders the LESSONS entries generically.
  await expect(
    page.getByRole("heading", { name: "Training tips" }),
  ).toBeVisible();
  await expect(page.getByText("RIR — reps in reserve")).toBeVisible();
  await expect(page.getByText(/reps you could still do/i)).toBeVisible();
  await shot(page, "3-tips-screen");

  // Browsing counted as reading: seen-state persisted to localStorage.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("lessons-seen")))
    .toContain("rir");

  // Back in the session (SPA back), the InfoTip dot is gone. The row remounts
  // with the details sheet closed, so reopen it (RIR is always shown there)
  // to reach the InfoTip.
  await page.goBack();
  await expect(page).toHaveURL(/\/session\//);
  await pullUpLogger(page);
  await page.getByTestId("set-0-more").click();
  await expect(page.getByTestId("infotip-rir")).toBeVisible();
  await expect(
    page.getByTestId("infotip-rir").locator("span.bg-accent"),
  ).toHaveCount(0);
  await shot(page, "4-session-infotip-dot-cleared");
});

test("/tips is reachable from Settings without a keyboard", async ({
  page,
}) => {
  await page.goto("/settings");
  const link = page.getByTestId("tips-link");
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  await shot(page, "5-settings-learn-section");
  await link.click();
  await expect(page).toHaveURL(/\/tips$/);
  await expect(
    page.getByRole("heading", { name: "Training tips" }),
  ).toBeVisible();
  await shot(page, "6-tips-from-settings");
});
