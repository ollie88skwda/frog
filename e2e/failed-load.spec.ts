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
  await expect(page).toHaveURL(/\/routines$/);
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
