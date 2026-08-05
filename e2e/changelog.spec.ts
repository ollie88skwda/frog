import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

// /changelog: dev-facing log of docs/DECISIONS.md entries (2026-08-04). The
// Profile nav item shows an accent dot while the log's newest entry postdates
// the stored `changelogLastSeen` marker; visiting /changelog updates the
// marker and clears it.

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS;
  if (!dir) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test("nav badge shows an unseen entry, /changelog surfaces it in order, and visiting clears the badge", async ({
  page,
}) => {
  // Force "never visited" further back than any real docs/DECISIONS.md entry
  // — the badge condition (latest > lastSeen) then holds regardless of
  // whatever is actually newest in the log today. A reload is needed since
  // the nav's unseen check reads localStorage once at mount.
  await page.evaluate(() =>
    localStorage.setItem("changelogLastSeen", "2000-01-01"),
  );
  await page.reload();
  await expect(page.getByTestId("start-session-btn")).toBeVisible();

  const profileTab = page.getByTitle("Profile");
  await expect(profileTab.locator("span.bg-accent")).toBeVisible();
  await shot(page, "1-profile-badge-unseen");

  // Reach /changelog the keyboard-free way: Profile → Settings gear →
  // Changelog section's Browse link (same pattern as /tips).
  await profileTab.click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByTestId("profile-settings").click();
  await expect(page).toHaveURL(/\/settings$/);

  const changelogLink = page.getByTestId("changelog-link");
  await expect(page.getByTestId("changelog-unseen-dot")).toBeVisible();
  await changelogLink.scrollIntoViewIfNeeded();
  await shot(page, "2-settings-changelog-section");
  await changelogLink.click();
  await expect(page).toHaveURL(/\/changelog$/);
  // Match the level too: react-router runs the navigation in a transition, so
  // Settings stays mounted until the lazy chunk lands — and it has its own
  // "Changelog" section <h2>. Only the page's <h1> proves we got here.
  await expect(
    page.getByRole("heading", { level: 1, name: "Changelog", exact: true }),
  ).toBeVisible();

  // Entries newer than the (far-past) marker are surfaced in their own
  // section at the top of the page.
  const newSection = page.getByTestId("changelog-new");
  await expect(newSection).toBeVisible();
  await expect(newSection.locator("[data-date]").first()).toBeVisible();
  await shot(page, "3-changelog-new-section");

  // Full history renders reverse-chronological (newest date first).
  const dates = await page
    .getByTestId("changelog-all")
    .locator("[data-date]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-date")));
  expect(dates.length).toBeGreaterThan(1);
  for (let i = 1; i < dates.length; i++) {
    expect(dates[i]! <= dates[i - 1]!).toBe(true);
  }

  // Visiting updated the stored marker to the newest entry's date. Reload
  // (fresh app boot, not just in-memory state) — the badge stays cleared.
  await page.reload();
  await expect(page).toHaveURL(/\/changelog$/);
  await page.goto("/profile");
  // Wait for the nav to actually paint first — a `toHaveCount(0)` on a shell
  // that hasn't booted yet passes for the wrong reason.
  await expect(page.getByTitle("Profile")).toBeVisible();
  await expect(
    page.getByTitle("Profile").locator("span.bg-accent"),
  ).toHaveCount(0);
  await shot(page, "4-profile-badge-cleared");

  // Revisiting shows no "new" section — the marker has caught up.
  await page.goto("/changelog");
  await expect(
    page.getByRole("heading", { level: 1, name: "Changelog", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("changelog-new")).toHaveCount(0);
  await expect(page.getByTestId("changelog-all")).toBeVisible();
  await shot(page, "5-changelog-no-new-section");
});
