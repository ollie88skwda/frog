import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Screenshot import (frog-import-ocr): a synthetic Hevy screenshot is read by
// the on-device OCR (self-hosted tesseract.js), lands in the shared review
// screen, writes nothing until confirmed, then shows in History. Also asserts
// the image never leaves the device: no request goes to a third-party host.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("screenshot → review → confirm → History, fully on-device", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const external: string[] = [];
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
  });
  // Large POST bodies are only legitimate after confirm (the session import).
  let confirmed = false;
  const uploads: string[] = [];
  page.on("request", (r) => {
    if (
      !confirmed &&
      r.method() === "POST" &&
      (r.postData()?.length ?? 0) > 20_000
    )
      uploads.push(r.url());
  });

  await page.goto("/import");
  await page
    .getByTestId("import-screenshot-input")
    .setInputFiles("packages/core/src/import/ocr/fixtures/hevy-light.png");

  await expect(page.getByTestId("import-review")).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByTestId("review-counts")).toContainText("1 sessions");
  // Review shots (390x844 day/night) for PRs: OCR_SHOTS=<dir> bun run e2e ...
  if (process.env.OCR_SHOTS) {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const mode of ["day", "night"]) {
      await page.evaluate(
        (m) => document.documentElement.setAttribute("data-mode", m),
        mode,
      );
      await page.screenshot({
        path: `${process.env.OCR_SHOTS}/screenshot-review-${mode}.png`,
      });
    }
  }
  await expect(page.getByTestId("review-counts")).toContainText("7 sets");
  await expect(page.getByText("Push Day").first()).toBeVisible();
  await expect(page.getByText("Triceps Pushdown").first()).toBeVisible();

  // Nothing written before confirm.
  const count = () =>
    page.evaluate(async () => {
      const { count } = await window.__frog.db
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("title", "Push Day");
      return count ?? 0;
    });
  expect(await count()).toBe(0);

  expect(uploads).toEqual([]);
  confirmed = true;
  await page.getByTestId("review-confirm").click();
  await expect(page.getByTestId("import-done")).toBeVisible();
  expect(await count()).toBe(1);

  await page.getByTestId("import-view-history").click();
  await expect(page.getByText("Push Day").first()).toBeVisible({
    timeout: 15_000,
  });

  expect(external).toEqual([]);
  expect(uploads).toEqual([]);
});
