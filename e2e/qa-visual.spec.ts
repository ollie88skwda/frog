// Brand QA sweep (not part of normal CI): QA_VISUAL=1 bun scripts/run-e2e.ts -- e2e/qa-visual.spec.ts
import { test } from "@playwright/test";
import { EMAIL, PASSWORD, signInAs } from "./helpers";

test.skip(!process.env.QA_VISUAL, "QA only");
test.setTimeout(600_000);

const ROUTES = [
  "/train",
  "/routines",
  "/routines/new",
  "/programs",
  "/trainer",
  "/profile",
  "/calendar",
  "/library",
  "/history",
  "/findings",
  "/measures",
  "/stats",
  "/stats/monthly",
  "/stats/year",
  "/settings",
  "/tips",
  "/changelog",
  "/nope-404",
  "/auth",
  "SESSION",
];
const SCALE = new Set([0, 4, 8, 12, 16, 24]);

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
      await page.goto("/train");
      await page
        .getByTestId("start-session-btn")
        .click()
        .catch(() => {});
      await page.waitForURL(/session\//, { timeout: 8000 }).catch(() => {});
      const sessionUrl = page.url().includes("/session/")
        ? new URL(page.url()).pathname
        : null;
      const report: string[] = [];
      for (const r of ROUTES) {
        const path = r === "SESSION" ? sessionUrl : r;
        if (!path) continue;
        if (path === "/auth")
          await page.evaluate(() => window.__frog.signOut());
        await page.goto(path);
        await page.waitForTimeout(1200);
        const res = await page.evaluate(
          (scale) => {
            const out: Record<string, unknown> = {};
            const de = document.documentElement;
            out.overflowX = de.scrollWidth > de.clientWidth + 1;
            out.mode = de.dataset.mode;
            out.bodyFont = getComputedStyle(document.body).fontFamily.slice(
              0,
              40,
            );
            const h = document.querySelector("h1,h2");
            out.headFont = h
              ? getComputedStyle(h).fontFamily.slice(0, 30)
              : null;
            const bad = new Set<string>();
            const lines = new Set<string>();
            const fonts = new Set<string>();
            const clipped = new Set<string>();
            for (const el of Array.from(document.body.querySelectorAll("*"))) {
              const cs = getComputedStyle(el);
              const tag = el.tagName.toLowerCase();
              if (tag === "svg" || el.closest("svg")) continue;
              const rect = el.getBoundingClientRect();
              if (!rect.width) continue;
              const id = `${tag}.${String(el.className).toString().slice(0, 50)}`;
              for (const k of [
                "borderTopLeftRadius",
                "borderTopRightRadius",
                "borderBottomLeftRadius",
                "borderBottomRightRadius",
              ] as const) {
                const v = parseFloat(cs[k]);
                const circle =
                  Math.abs(rect.width - rect.height) < 2 &&
                  v >= rect.width / 2 - 1;
                if (v > 0 && !scale.includes(v) && !circle)
                  bad.add(`${v}px ${id}`);
              }
              for (const s of ["Top", "Right", "Bottom", "Left"] as const) {
                if (
                  parseFloat(cs[`border${s}Width`]) > 0 &&
                  cs[`border${s}Style`] !== "none" &&
                  !["input", "textarea"].includes(tag) &&
                  !(el as HTMLElement).dataset.testid?.includes("input")
                )
                  lines.add(id);
              }
              if (
                el.childNodes.length &&
                Array.from(el.childNodes).some(
                  (n) => n.nodeType === 3 && n.textContent?.trim(),
                )
              ) {
                const ff = cs.fontFamily.split(",")[0].replace(/"/g, "").trim();
                fonts.add(ff);
                if (
                  el.scrollWidth > el.clientWidth + 2 &&
                  cs.overflow !== "visible" &&
                  cs.textOverflow !== "ellipsis" &&
                  cs.overflowX === "hidden"
                )
                  clipped.add(id);
              }
              if (
                rect.right > window.innerWidth + 1 &&
                cs.position !== "fixed" &&
                !el.closest("[class*=overflow]")
              )
                lines.add(`OVERFLOW:${id}`);
            }
            out.badRadii = [...bad].slice(0, 8);
            out.lines = [...lines].slice(0, 8);
            out.fonts = [...fonts];
            out.clipped = [...clipped].slice(0, 5);
            return out;
          },
          [...SCALE],
        );
        report.push(`${path} ${JSON.stringify(res)}`);
        await page.screenshot({
          path: `docs/brand/qa/${vp}-${mode}-${path.replace(/\W+/g, "_")}.jpg`,
          type: "jpeg",
          quality: 40,
          fullPage: false,
        });
      }
      console.log(`QAREPORT ${vp} ${mode}\n${report.join("\n")}`);
      await ctx.close();
    });
