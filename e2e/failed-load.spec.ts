import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Design-audit regression: a failed request must never read as "you have no
// data". Each screen below shows a plain error with Retry (QueryState) and the
// real content returns once the backend answers again.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

const FAIL = {
  status: 400,
  contentType: "application/json",
  body: JSON.stringify({
    status: "error",
    errorMessage: "Server Error\nUncaught Error: simulated outage",
  }),
};

async function failedThenRecovers(
  page: import("@playwright/test").Page,
  route: string,
  pattern: string,
  falseEmpty: RegExp,
  recovered: string,
) {
  await page.route(pattern, (r) => r.fulfill(FAIL));
  await page.goto(route);
  const alert = page.getByRole("alert").first();
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(falseEmpty)).toHaveCount(0);
  await page.unroute(pattern);
  await alert.getByRole("button", { name: "Retry" }).click();
  // Recovered: the error is gone and the screen shows its real content.
  await expect(alert).toBeHidden({ timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: recovered }).first(),
  ).toBeVisible();
}

test("history: failed load shows an error, not 'No sessions yet'", async ({
  page,
}) => {
  await failedThenRecovers(
    page,
    "/history",
    "**/api/query?fn=sessions:list*",
    /No sessions yet|The lab is empty/,
    "History",
  );
});

test("routines: failed load shows an error, not 'No routines yet'", async ({
  page,
}) => {
  await failedThenRecovers(
    page,
    "/routines",
    "**/api/query?fn=rows:find&t=routine*",
    /No routines yet|The lab is empty/,
    "Routines",
  );
});

test("measures: failed load shows an error, not an editable empty day", async ({
  page,
}) => {
  await failedThenRecovers(
    page,
    "/measures",
    "**/api/query?fn=data:page&t=measurements*",
    /No data yet/,
    "Measures",
  );
});

test("icon-only buttons all carry an accessible name", async ({ page }) => {
  for (const route of ["/", "/train", "/library", "/calendar", "/settings"]) {
    await page.goto(route);
    await page.waitForTimeout(800);
    const unnamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button, a[href]"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return false;
          const text = (el.textContent ?? "").trim();
          return (
            !text &&
            !el.getAttribute("aria-label") &&
            !el.getAttribute("aria-labelledby") &&
            !el.querySelector("img[alt]:not([alt=''])")
          );
        })
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`),
    );
    expect(unnamed, `${route} unnamed controls`).toEqual([]);
  }
});

test("routine delete asks for confirmation in a dialog", async ({ page }) => {
  const name = `ConfirmMe ${Date.now()}`;
  const ex = `ConfirmEx ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, ex);
  await waitForExercise(page, ex);
  await page.goto("/routines/new");
  await page.getByTestId("routine-name-input").fill(name);
  await page.getByTestId("routine-add-exercise-btn").click();
  await page.getByTestId(`routine-pick-${ex}`).click();
  await page.getByTestId("routine-save-btn").click();
  await expect(page).toHaveURL(/\/plan\?s=routines$/);
  await page.getByTestId(`routine-menu-${name}`).click();
  await page.getByTestId(`routine-delete-${name}`).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText(`Delete routine “${name}”?`)).toBeVisible();
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId(`routine-card-${name}`)).toBeVisible();
  await page.getByTestId(`routine-menu-${name}`).click();
  await page.getByTestId(`routine-delete-${name}`).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete routine" })
    .click();
  await expect(page.getByTestId(`routine-card-${name}`)).toHaveCount(0);
});

// A query started while the device is offline is *paused* (pending, not
// loading, not errored). It must read as loading — never as "you have no
// data" — and fill in once the connection returns. TanStack Query learns
// connectivity from the window online/offline events; the network itself
// stays up so the lazy route chunks still load.
test("offline: paused first loads read as loading, then recover", async ({
  page,
}) => {
  const goClient = (path: string) =>
    page.evaluate((p) => {
      history.pushState({}, "", p);
      dispatchEvent(new PopStateEvent("popstate"));
    }, path);
  const setOnline = (on: boolean) =>
    page.evaluate(
      (o) => dispatchEvent(new Event(o ? "online" : "offline")),
      on,
    );
  const cases: [string, string, RegExp][] = [
    ["history", "/history", /No sessions yet|The lab is empty/],
    ["history-detail", `/history/${crypto.randomUUID()}`, /Session not found/],
    ["measures", "/measures", /No data yet/],
    ["calendar", "/calendar", /No sessions/],
  ];
  // Today preloads the sessions list (shared with Calendar), so start each case
  // from a page that caches no session data: a full load drops the cache.
  for (const [name, path, falseEmpty] of cases) {
    await page.goto("/changelog");
    await expect(
      page.getByRole("heading", { name: "Changelog", exact: true }),
    ).toBeVisible();
    await setOnline(false);
    await goClient(path);
    const loading = page.locator("main").getByRole("status");
    await expect(loading.first()).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByText(falseEmpty)).toHaveCount(0);
    await expect(loading.first()).toBeVisible();
    if (process.env.NM_EVIDENCE)
      await page.screenshot({
        path: `${process.env.NM_EVIDENCE}/offline-${name}.png`,
      });
    await setOnline(true);
    await expect(loading).toHaveCount(0, { timeout: 20_000 });
    if (process.env.NM_EVIDENCE)
      await page.screenshot({
        path: `${process.env.NM_EVIDENCE}/online-${name}.png`,
      });
    if (name === "history-detail")
      await expect(page.getByText(/Session not found/)).toBeVisible();
  }
});
