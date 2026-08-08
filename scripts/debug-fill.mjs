import { chromium } from "@playwright/test";
const BASE = "http://localhost:4321";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth`);
await page.waitForFunction(() => window.__frog !== undefined);
await page.evaluate(async ({ email, password }) => {
  const { error } = await window.__frog.supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}, { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD });
// open the last session's exercise: pick any exercise with history — use the most recent custom one
const { data: exs } = await page.evaluate(async () => {
  const r = await window.__frog.supabase.from("exercises").select("name").ilike("name", "Protocol Bench%").order("created_at", { ascending: false }).limit(1);
  return r;
});
const EX = exs[0].name;
console.log("exercise:", EX);
await page.goto(`${BASE}/train`);
await page.getByTestId("start-session-btn").click();
await page.getByTestId(`pick-exercise-${EX}`).click();
await page.waitForSelector(`[data-testid="block-${EX}-setup-last-0"]`);
const hasRef = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid^="block-"][data-testid$="-setup-last-0"]');
  return btn ? btn.outerHTML.slice(0, 200) : "none";
});
console.log("last-0 button:", hasRef);
await page.getByTestId(`block-${EX}-setup-last-0`).tap();
await page.waitForTimeout(800);
const w = await page.getByTestId("set-0-weight").inputValue();
const r = await page.getByTestId("set-0-reps").inputValue();
console.log("after tap: weight=", JSON.stringify(w), "reps=", JSON.stringify(r));
await browser.close();
