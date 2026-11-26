// Motion audit probe (not part of normal CI):
//   MOTION_PROBE=<label> bun scripts/run-e2e.ts motion-probe.spec.ts
// Logs every animation that starts (CSS keyframes, WAAPI incl. motion's
// accelerated opacity/transform, and motion's JS-driven inline style writes)
// per scripted step, and saves 390px screenshots mid-transition to
// docs/ux-audit/2026-11-25/motion/probe-<label>/. Evidence for the
// 2026-11-25 "animations bad" pass (docs/DECISIONS.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

const LABEL = process.env.MOTION_PROBE ?? "";
test.skip(!LABEL, "motion audit only");
test.setTimeout(240_000);
test.use({ viewport: { width: 390, height: 844 } });

const OUT = join(
  __dirname,
  "../docs/ux-audit/2026-11-25/motion",
  `probe-${LABEL}`, // raw frames; composites are committed beside it
);

declare global {
  interface Window {
    __motionLog: { t: number; kind: string; what: string; detail: string }[];
    __motionMark: (step: string) => void;
  }
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const describe = (el: Element | null): string => {
      if (!el) return "?";
      const tid = el.closest("[data-testid]")?.getAttribute("data-testid");
      const tag = el.tagName.toLowerCase();
      const cls = (el.getAttribute("class") ?? "").split(/\s+/).slice(0, 4);
      return `${tag}${tid ? `[${tid}]` : ""}.${cls.join(".")}`;
    };
    const t0 = performance.now();
    window.__motionLog = [];
    const log = (kind: string, what: string, detail: string) =>
      window.__motionLog.push({
        t: Math.round(performance.now() - t0),
        kind,
        what,
        detail,
      });
    window.__motionMark = (step) => log("STEP", step, "");
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (kf, opts) {
      const dur =
        typeof opts === "number"
          ? opts
          : (opts as KeyframeAnimationOptions)?.duration;
      const props = Array.isArray(kf)
        ? Object.keys(kf[0] ?? {}).filter(
            (k) => k !== "offset" && k !== "easing",
          )
        : Object.keys(kf ?? {});
      log("waapi", describe(this), `${props.join(",")} ${String(dur)}ms`);
      return orig.call(this, kf, opts as KeyframeAnimationOptions);
    };
    document.addEventListener(
      "animationstart",
      (e) => log("css", describe(e.target as Element), e.animationName),
      true,
    );
    // motion's JS-driven values (height, layout springs) write inline
    // styles every frame; count writes per element and report bursts.
    const counts = new Map<Element, number>();
    new MutationObserver((muts) => {
      for (const m of muts) {
        const el = m.target as Element;
        const s = (el as HTMLElement).style?.cssText ?? "";
        if (!/height|transform|opacity/.test(s)) continue;
        const n = (counts.get(el) ?? 0) + 1;
        counts.set(el, n);
        if (n === 3) log("js-style", describe(el), s.slice(0, 90));
      }
    }).observe(document, {
      attributes: true,
      attributeFilter: ["style"],
      subtree: true,
    });
    setInterval(() => counts.clear(), 400);
  });
}

async function step(page: Page, name: string) {
  await page.evaluate((s) => window.__motionMark(s), name);
}

/** Screenshots at fixed offsets after an action, for timing evidence. */
async function burst(
  page: Page,
  name: string,
  offsets = [0, 60, 140, 260, 600],
) {
  let last = 0;
  for (const ms of offsets) {
    await page.waitForTimeout(ms - last);
    last = ms;
    await page.screenshot({ path: join(OUT, `${name}-${ms}ms.png`) });
  }
}

/** Samples an element's top edge every frame for `ms` (overshoot check). */
async function sampleTop(page: Page, selector: string, ms: number) {
  return page.evaluate(
    ({ selector, ms }) =>
      new Promise<string>((resolve) => {
        const out: string[] = [];
        const t0 = performance.now();
        const tick = () => {
          const el = document.querySelector(selector);
          const t = Math.round(performance.now() - t0);
          out.push(
            `${t}:${el ? Math.round(el.getBoundingClientRect().top) : "-"}`,
          );
          if (t < ms) requestAnimationFrame(tick);
          else resolve(out.join(" "));
        };
        tick();
      }),
    { selector, ms },
  );
}

/** Height of the element right after `testid`'s parent row, per frame. */
async function sampleHeight(page: Page, testid: string, ms: number) {
  return page.evaluate(
    ({ testid, ms }) =>
      new Promise<string>((resolve) => {
        const out: string[] = [];
        const t0 = performance.now();
        const row = document.querySelector(
          `[data-testid="${testid}"]`,
        )?.parentElement;
        const tick = () => {
          const el = row?.nextElementSibling as HTMLElement | null;
          const t = Math.round(performance.now() - t0);
          out.push(
            `${t}:${el ? Math.round(el.getBoundingClientRect().height) : "-"}`,
          );
          if (t < ms) requestAnimationFrame(tick);
          else resolve(out.join(" "));
        };
        tick();
      }),
    { testid, ms },
  );
}

async function seedWeek(page: Page) {
  await page.evaluate(async () => {
    const sb = window.__frog.db;
    const uid = () => crypto.randomUUID();
    const now = Date.now();
    const exIds: string[] = [];
    for (const [name, muscle] of [
      ["Probe Bench", "pecs"],
      ["Probe Squat", "quads"],
      ["Probe Row", "lats"],
    ]) {
      const id = uid();
      exIds.push(id);
      await sb.from("exercises").insert({
        id,
        created_at: now,
        updated_at: now,
        name: `${name} ${now}`,
        is_custom: true,
        mechanic: "compound",
        muscle_targets: [{ muscle, tier: "primary", role: "primary" }],
      });
    }
    for (let d = 1; d <= 3; d++) {
      const t = now - d * 86_400_000;
      const sid = uid();
      await sb.from("sessions").insert({
        id: sid,
        created_at: t,
        updated_at: t,
        started_at: t,
        ended_at: t + 3_600_000,
      });
      for (const [i, ex] of exIds.entries()) {
        const se = uid();
        await sb.from("session_exercises").insert({
          id: se,
          created_at: t,
          updated_at: t,
          session_id: sid,
          exercise_id: ex,
          order_index: i,
        });
        for (let s = 0; s < 3; s++)
          await sb.from("set_logs").insert({
            id: uid(),
            created_at: t,
            updated_at: t,
            session_exercise_id: se,
            set_no: s,
            weight_kg: 60 + d * 5,
            reps: 8,
            rir_min: 2,
            rir_max: 2,
            completed: true,
          });
      }
    }
  });
}

test("motion probe", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  mkdirSync(OUT, { recursive: true });
  await installProbe(page);
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
  await seedWeek(page);
  await page.goto("/");
  await expect(page.getByTestId("home-hero")).toBeVisible();
  await page.waitForTimeout(1500);

  // 1. Tab switches (route fade + nav pill), first visit then cache-hit return.
  await step(page, "tab: Today -> Plan (first visit)");
  await page.getByRole("link", { name: "Plan" }).last().click();
  await burst(page, "tab-plan-first");
  await page.waitForTimeout(1200);
  await step(page, "tab: Plan -> Today (cache hit)");
  await page.getByRole("link", { name: "Today" }).last().click();
  await burst(page, "tab-today-return");
  await page.waitForTimeout(1200);
  await step(page, "tab: Today -> Progress (first visit)");
  await page.getByRole("link", { name: "Progress" }).last().click();
  await burst(page, "tab-progress-first");
  await page.waitForTimeout(1500);
  await step(page, "tab: Progress -> Today (cache hit)");
  await page.getByRole("link", { name: "Today" }).last().click();
  await burst(page, "tab-today-return2");
  await page.waitForTimeout(1200);

  // 2. Background revalidation on Today: invalidate every query (what a
  // window refocus or a mutation does) and see what replays.
  // Let every query go stale (staleTime 15s), then refocus the tab: TanStack
  // refetches everything in the background. Nothing should replay.
  await page.waitForTimeout(16_000);
  let reqs = 0;
  const onReq = (r: { url(): string }) => {
    if (r.url().includes(":3250/api/")) reqs++;
  };
  page.on("request", onReq);
  await step(page, "revalidate: tab refocus after 16s (background refetch)");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    window.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await burst(page, "revalidate", [0, 100, 300, 1500]);
  page.off("request", onReq);
  await page.evaluate(
    (n) => window.__motionMark(`revalidate: ${n} backend requests fired`),
    reqs,
  );

  // 3. Plan segments.
  await page.getByRole("link", { name: "Plan" }).last().click();
  await page.waitForTimeout(1200);
  for (const seg of ["Routines", "Library", "Program", "Routines"]) {
    await step(page, `segment: Plan -> ${seg}`);
    await page
      .getByRole("radio", { name: seg })
      .or(page.getByRole("button", { name: seg, exact: true }))
      .first()
      .click();
    await burst(page, `seg-${seg.toLowerCase()}`, [0, 80, 200, 500]);
    await page.waitForTimeout(800);
  }

  // 3b. Disclosure (Library "Group & quality"): sample its height per frame.
  await page
    .getByRole("radio", { name: "Library" })
    .or(page.getByRole("button", { name: "Library", exact: true }))
    .first()
    .click();
  await page.waitForTimeout(800);
  await step(page, "collapse: open Group & quality");
  await page.getByTestId("library-more-toggle").click();
  const hs = await sampleHeight(page, "library-more-toggle", 500);
  await page.evaluate(
    (t) => window.__motionMark(`collapse height px by ms: ${t}`),
    hs,
  );
  await page.getByTestId("library-more-toggle").click();
  await page.waitForTimeout(600);

  // 4. Progress segments (volume carries the muscle meters).
  await page.getByRole("link", { name: "Progress" }).last().click();
  await page.waitForTimeout(1200);
  for (const seg of ["volume", "strength", "volume"]) {
    await step(page, `progress segment -> ${seg}`);
    await page.getByTestId(`progress-seg-${seg}`).click();
    await burst(page, `progress-${seg}`, [0, 60, 140, 400]);
    await page.waitForTimeout(800);
  }

  // 5. Sheet open/close (info note dialog).
  await page.getByTestId("progress-seg-strength").click();
  await page.waitForTimeout(600);
  await step(page, "sheet: open About strength");
  await page.getByRole("button", { name: "About strength" }).click();
  const tops = await sampleTop(page, '[role="dialog"]', 600);
  await page.evaluate(
    (t) => window.__motionMark(`sheet top px by ms: ${t}`),
    tops,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "About strength" }).click();
  await burst(page, "sheet-open", [0, 50, 120, 220, 400]);
  await step(page, "sheet: close");
  await page.keyboard.press("Escape");
  await burst(page, "sheet-close", [0, 50, 120, 220]);
  await page.waitForTimeout(600);

  // 6. Enter / leave a session (tab bar hides then shows).
  await page.getByRole("link", { name: "Today" }).last().click();
  await page.waitForTimeout(1000);
  await step(page, "session: start empty");
  await page.getByTestId("start-session-btn").click();
  await page.waitForURL(/\/session\//);
  await burst(page, "session-enter", [0, 100, 300]);
  await page.waitForTimeout(800);
  await step(page, "session: back to Today");
  await page.goBack();
  await burst(page, "session-leave", [0, 60, 140, 400]);
  await page.waitForTimeout(1000);

  // 7. Reduced motion: tab switch + sheet should not move or blank.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(400);
  await step(page, "reduced motion: tab Today -> Progress");
  await page.getByRole("link", { name: "Progress" }).last().click();
  await burst(page, "reduced-tab", [0, 60, 140]);
  await page.waitForTimeout(800);
  await step(page, "reduced motion: open About strength");
  await page.getByTestId("progress-seg-strength").click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "About strength" }).click();
  const rtops = await sampleTop(page, '[role="dialog"]', 300);
  await page.evaluate(
    (t) => window.__motionMark(`reduced sheet top px by ms: ${t}`),
    rtops,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  await page.getByRole("link", { name: "Plan" }).last().click();
  await page.waitForTimeout(800);
  await page
    .getByRole("radio", { name: "Library" })
    .or(page.getByRole("button", { name: "Library", exact: true }))
    .first()
    .click();
  await page.waitForTimeout(800);
  await step(page, "reduced motion: open Group & quality");
  await page.getByTestId("library-more-toggle").click();
  const rhs = await sampleHeight(page, "library-more-toggle", 400);
  await page.evaluate(
    (t) => window.__motionMark(`reduced collapse height px by ms: ${t}`),
    rhs,
  );
  await page.screenshot({ path: join(OUT, "reduced-collapse-30ms.png") });

  const log = await page.evaluate(() => window.__motionLog);
  const lines = log.map((e) =>
    e.kind === "STEP"
      ? `\n## ${e.what}  (t=${e.t}ms)`
      : `  +${e.t}ms ${e.kind.padEnd(8)} ${e.what}  ${e.detail}`,
  );
  writeFileSync(join(OUT, "animation-log.md"), lines.join("\n"));

  await page.emulateMedia({ reducedMotion: "no-preference" });
  // 3c. Today meters on a cache-hit return, slowed 10x so a frame can show it.
  await page.getByRole("link", { name: "Today" }).last().click();
  await page.waitForTimeout(1200);
  await page.getByRole("link", { name: "Plan" }).last().click();
  await page.waitForTimeout(1200);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });
  await step(page, "slowmo 10x: Plan -> Today (cache hit)");
  await page.getByRole("link", { name: "Today" }).last().click();
  await burst(page, "slowmo-today-return", [0, 300, 900]);
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
});
