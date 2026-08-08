// Throwaway visual-verification driver for the Protocol redesign (Option C).
// Signs in via the __frog bridge, drives a 390×844 session, screenshots the
// states the PR needs: pre-flight, mid-station (chips + rest pill), unilateral
// strip, last-workout tap-to-fill.
import { chromium } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const BASE = "http://localhost:4321";
const OUT = "/tmp/protocol-shots";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

const unique = (p) => `${p}-${Date.now()}`;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth`);
  await page.waitForFunction(() => (window).__frog !== undefined);
  await page.evaluate(
    async ({ email, password }) => {
      const { error } = await (window).__frog.supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);
    },
    { email: EMAIL, password: PASSWORD },
  );

  // Exercise with a prior session so "Last workout" has data.
  const EX = unique("Protocol Bench");
  await page.goto(`${BASE}/library`);
  await page.getByTestId("new-exercise-btn").click();
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await page.waitForFunction(
    (n) => (window).__frog.supabase.from("exercises").select("id").eq("name", n).then((r) => r.count),
    EX,
  );

  // Session 1: log two sets (creates history).
  await page.goto(`${BASE}/train`);
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Pre-flight visible on a fresh exercise.
  const block = page.getByTestId(`block-${EX}`);
  await page.waitForSelector(`[data-testid="block-${EX}-setup"]`);
  await page.screenshot({ path: `${OUT}/1-preflight-fresh.png`, fullPage: true });

  // Start logging → pre-flight collapses; strip is live.
  await page.getByTestId(`block-${EX}-setup-start`).click();
  await page.waitForSelector(`[data-testid="block-${EX}-setup"]`, { state: "detached" });
  await page.getByTestId("set-0-weight").fill("80");
  await page.getByTestId("set-0-reps").fill("5");
  await page.screenshot({ path: `${OUT}/2-strip-filled.png`, fullPage: true });
  await page.getByTestId("set-0-reps").press("Enter");

  // Rest pill should now be visible, naming set 1. Wait ~2s to show ticking.
  await page.waitForSelector(`[data-testid="rest-${EX}"]`);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/3-rest-pill.png`, fullPage: true });

  // Typing the next set auto-stops the pill.
  await page.getByTestId("set-1-weight").fill("80");
  await page.waitForSelector(`[data-testid="rest-${EX}"]`, { state: "detached" });
  await page.getByTestId("set-1-reps").fill("5");
  await page.getByTestId("set-1-reps").press("Enter");
  await page.waitForTimeout(800);

  // Flip the strip to unilateral for set 2 — one tap, no sheet.
  await page.getByTestId("set-2-laterality-unilateral").tap();
  await page.waitForSelector(`[data-testid="set-2-right-reps"]`);
  await page.screenshot({ path: `${OUT}/4-unilateral-strip.png`, fullPage: true });
  await page.getByTestId("set-2-weight").fill("75");
  await page.getByTestId("set-2-reps").fill("8");
  await page.getByTestId("set-2-right-reps").fill("7");
  await page.getByTestId("set-2-done").tap();

  // Chips: one per physical set, the pair as one chip with two zones.
  await page.waitForSelector(`[data-testid="committed-2"]`);
  await page.screenshot({ path: `${OUT}/5-chips-pair.png`, fullPage: true });

  // Finish session 1.
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await page.waitForURL(/\/history\//);

  // Session 2: pre-flight shows Last workout; tap-to-fill works.
  await page.goto(`${BASE}/train`);
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await page.waitForSelector(`[data-testid="block-${EX}-setup"]`);
  await page.waitForSelector(`[data-testid="block-${EX}-setup-last-0"]`);
  await page.screenshot({ path: `${OUT}/6-preflight-last-workout.png`, fullPage: true });
  const last0 = await page.getByTestId(`block-${EX}-setup-last-0`).innerText();
  console.log("last workout set 0:", JSON.stringify(last0));
  await page.getByTestId(`block-${EX}-setup-last-0`).tap();
  await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLInputElement>('[data-testid="set-0-weight"]');
      return el && el.value !== "";
    },
  );
  const w = await page.getByTestId("set-0-weight").inputValue();
  const r = await page.getByTestId("set-0-reps").inputValue();
  console.log("strip filled from last workout:", w, "×", r);
  await page.screenshot({ path: `${OUT}/7-strip-filled-from-last.png`, fullPage: true });

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
