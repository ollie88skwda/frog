import { test } from "@playwright/test";
import { createExercise, signIn, waitForExercise } from "./helpers";
import { addSet, finishSession, makeExercise, openSetTypeMenu, startSessionWith } from "./spotlight-helpers";
const D = "/tmp/uni-shots2";
test.setTimeout(180_000);
for (const mode of ["day", "night"]) test(`e2 ${mode}`, async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  const dm = () => page.evaluate((m) => document.documentElement.setAttribute("data-mode", m), mode);
  const ruler = async (field: string, ruler: string, keys: string[]) => {
    await page.getByTestId(field).click();
    await page.getByTestId(ruler).focus();
    for (const k of keys) await page.keyboard.press(k);
  };
  await signIn(page);
  const EX = mode === "day" ? "Single-arm DB row" : "One-arm cable row";
  await page.goto("/library"); await createExercise(page, EX); await waitForExercise(page, EX);
  // Session 1: history so session 2 prefills (last time L 30x10, R 30x9).
  await startSessionWith(page, EX);
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await page.getByTestId("e2-weight").fill("30");
  await page.getByTestId("e2-reps").fill("10");
  await page.getByTestId("e2-reps2").fill("9");
  await ruler("e2-rir", "rir-ruler", ["ArrowRight", "ArrowLeft"]);
  await ruler("e2-rir2", "rir-ruler", ["ArrowRight", "ArrowLeft"]);
  await page.getByTestId("log-set").click();
  await page.waitForTimeout(800);
  await finishSession(page);
  // Session 2.
  await startSessionWith(page, EX);
  await page.waitForTimeout(500);
  if (!(await page.getByTestId("e2-reps").isVisible())) {
    await openSetTypeMenu(page);
    await page.getByTestId("set-type-perside").click();
  }
  await dm(); await page.waitForTimeout(200);
  await page.screenshot({ path: `${D}/${mode}-1-prefilled.png` });
  await ruler("e2-reps2", "reps-ruler", ["ArrowLeft"]);
  await dm(); await page.waitForTimeout(200);
  await page.screenshot({ path: `${D}/${mode}-2-right-reps.png` });
  await ruler("e2-rir", "rir-ruler", ["ArrowRight", "ArrowLeft"]);
  await dm(); await page.waitForTimeout(200);
  await page.screenshot({ path: `${D}/${mode}-3-left-rir.png` });
  await ruler("e2-rir2", "rir-ruler", ["ArrowRight", "ArrowLeft"]);
  await page.getByTestId("log-set").click();
  await page.waitForTimeout(800);
  if (!(await page.getByTestId("log-set").isVisible())) await addSet(page);
  await dm(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${D}/${mode}-4-logged.png` });
  await page.getByTestId("e2-weight").click(); await dm(); await page.waitForTimeout(200);
  await page.screenshot({ path: `${D}/${mode}-5-weight.png` });
});
