import { expect, test } from "@playwright/test";
import { loadOrCreateTestAuth } from "../scripts/convex-test-auth";
import { EMAIL, PASSWORD, signInAs } from "./helpers";

// The weight unit follows the ACCOUNT, not the browser (iOS sim report
// 2026-11-25 §4: the Home Screen app has its own storage and reverted to lb).
// Two browser contexts = two separate localStorages on one account: picking
// kg in one must show kg in the other after load.

test("weight unit set in one browser shows in another on the same account", async ({
  browser,
}) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  const keyPath = process.env.E2E_TEST_KEY;
  if (!keyPath) throw new Error("E2E_TEST_KEY unset — run via `bun run e2e`");
  // A fresh identity so the shared suite user's unit stays untouched; the
  // `e2e-` sub is swept by scripts/e2e-cleanup.ts.
  const sub = `e2e-unit-${Date.now()}`;
  const email = `${sub}@frog.test`;
  const token = await (await loadOrCreateTestAuth(keyPath)).mint(sub);

  const a = await browser.newContext();
  const pa = await a.newPage();
  await signInAs(pa, token, email);
  await pa.goto("/settings");
  await expect(pa.getByTestId("unit-lb")).toHaveClass(/bg-accent/);
  await pa.getByTestId("unit-kg").click();
  await expect(pa.getByTestId("unit-kg")).toHaveClass(/bg-accent/);
  // Let the account write land before the second device loads (soft, with a
  // short timeout, so the pre-fix run still reaches the cross-device check).
  await expect
    .poll(
      () =>
        pa.evaluate(async () => {
          const { data } = await window.__frog.db
            .from("user_prefs")
            .select("weight_unit");
          return data?.[0]?.weight_unit ?? null;
        }),
      { timeout: 5_000 },
    )
    .toBe("kg")
    .catch(() => {});

  const b = await browser.newContext();
  const pb = await b.newPage();
  await signInAs(pb, token, email);
  await pb.goto("/settings");
  await expect(pb.getByTestId("unit-kg")).toHaveClass(/bg-accent/);
  expect(await pb.evaluate(() => localStorage.getItem("unit"))).toBe("kg");

  await a.close();
  await b.close();
});
