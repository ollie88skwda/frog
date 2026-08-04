import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  rowCount,
  signIn,
  waitForExercise,
} from "./helpers";

// Voice set logging: tap the mic, speak one utterance ("rear delt flies 250
// lbs for 5 reps"), and the matching block's ACTIVE ROW gets filled — never
// committed. The Web Speech API can't be driven by Playwright (Chrome's
// implementation is server-backed and needs real audio), so the recognition
// constructor is stubbed at page init: the app's feature detection, matching,
// unit resolution, picker fallback and error copy are all still the real ones,
// only the audio→transcript hop is replaced.

const EX = "Rear Delt Flyes"; // fuzzy-matched from spoken "rear delt flies"
const OTHER = "Bench Press"; // a global seed exercise — the block that must NOT be touched

// Screenshots land here when the runner sets it (evidence capture); unset in CI.
const EVIDENCE = process.env.E2E_EVIDENCE_DIR;

async function shot(page: Page, name: string) {
  if (!EVIDENCE) return;
  // Settle CSS transitions (dialog fade/scale) so the capture isn't a blur.
  await page.screenshot({
    path: `${EVIDENCE}/${name}.png`,
    animations: "disabled",
  });
}

declare global {
  interface Window {
    __voice: {
      starts: number;
      say: (transcript: string) => void;
      fail: (error: string) => void;
    };
  }
}

async function installSpeechStub(page: Page) {
  await page.addInitScript(() => {
    class StubRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onnomatch: (() => void) | null = null;
      start() {
        stub.active = this;
        stub.starts += 1;
      }
      stop() {
        stub.active = null;
        this.onend?.();
      }
      abort() {
        stub.active = null;
      }
    }
    const stub = {
      starts: 0,
      active: null as StubRecognition | null,
      // One recognized utterance, shaped like a real SpeechRecognitionEvent
      // (results[0][0].transcript), followed by the end event the API fires.
      say(transcript: string) {
        const r = stub.active;
        if (!r) throw new Error("mic is not listening");
        stub.active = null;
        r.onresult?.({ results: [[{ transcript, confidence: 1 }]] });
        r.onend?.();
      },
      fail(error: string) {
        const r = stub.active;
        if (!r) throw new Error("mic is not listening");
        stub.active = null;
        r.onerror?.({ error });
        r.onend?.();
      },
    };
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      StubRecognition;
    (window as unknown as { __voice: typeof stub }).__voice = stub;
  });
}

async function startSession(page: Page, names: string[]) {
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  for (const [i, name] of names.entries()) {
    // The picker auto-opens on an empty session; later picks reopen it.
    if (i > 0) await page.getByTestId("open-exercise-picker").click();
    await expect(page.getByTestId("exercise-search-input")).toBeVisible();
    await page.getByTestId("exercise-search-input").fill(name);
    await page.getByTestId(`pick-exercise-${name}`).click();
    await expect(page.getByTestId(`block-${name}`)).toBeVisible();
  }
}

async function speak(page: Page, transcript: string) {
  await page.getByTestId("voice-log-mic").click();
  await expect(page.getByTestId("voice-log-mic")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate((t) => window.__voice.say(t), transcript);
}

// Every test in this file logs the same exercise; adding it once keeps the
// spoken name unambiguous (a second "Rear Delt Flyes" row would tie).
async function ensureExercise(page: Page, name: string) {
  const existing = await page.evaluate(async (n) => {
    const { count, error } = await window.__frog.supabase
      .from("exercises")
      .select("id", { count: "exact", head: true })
      .eq("name", n);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, name);
  if (existing > 0) return;
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await installSpeechStub(page);
  await signIn(page);
  await ensureExercise(page, EX);
});

test("spoken set fills the matching block's active row and never commits it", async ({
  page,
}) => {
  await startSession(page, [EX, OTHER]);
  const target = page.getByTestId(`block-${EX}`);
  const untouched = page.getByTestId(`block-${OTHER}`);
  const before = await rowCount(page, "set_logs");

  await page.getByTestId("voice-log-mic").click();
  await expect(page.getByTestId("voice-log-mic")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await shot(page, "01-listening");

  await page.evaluate(() =>
    window.__voice.say("rear delt flies 250 lbs for 5 reps"),
  );

  // Fuzzy match ("flies" → "Flyes") lands on the right block, and only it.
  await expect(target.getByTestId("set-0-weight")).toHaveValue("250");
  await expect(target.getByTestId("set-0-reps")).toHaveValue("5");
  await expect(untouched.getByTestId("set-0-weight")).toHaveValue("");
  await expect(untouched.getByTestId("set-0-reps")).toHaveValue("");
  await shot(page, "02-filled-not-committed");

  // The filled row is a draft: nothing was written and no committed row exists.
  await expect(target.getByTestId("committed-0")).toHaveCount(0);
  await expect(page.getByTestId("voice-log-mic")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(await rowCount(page, "set_logs")).toBe(before);

  // Mobile viewport — the primary form factor for this control.
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "03-filled-mobile");
  await page.setViewportSize({ width: 1280, height: 720 });

  // Committing stays an explicit user action.
  await target.getByTestId("set-0-add").click();
  await expect(target.getByTestId("committed-0")).toBeVisible();
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(target.getByTestId("committed-0-weight")).toHaveText("250");
  await expect(target.getByTestId("committed-0-reps")).toHaveText("5");
  await shot(page, "04-committed-after-explicit-add");
});

test("a unitless spoken weight uses the block's own unit override, not the session unit", async ({
  page,
}) => {
  // Session unit kg, this exercise overridden to lbs: "250" must land as 250
  // lbs in the block's own column, not 250 kg re-displayed as 551.5 lbs.
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await startSession(page, [EX]);
  const target = page.getByTestId(`block-${EX}`);
  await page.getByTestId(`block-${EX}-unit`).click();
  await page.getByTestId(`block-${EX}-unit-lb`).click();
  await expect(page.getByTestId(`block-${EX}-unit`)).toContainText("lbs");

  await speak(page, "rear delt flies 250 for 5 reps");

  await expect(target.getByTestId("set-0-weight")).toHaveValue("250");
  await expect(target.getByTestId("set-0-reps")).toHaveValue("5");
  await shot(page, "05-block-unit-override");
});

test("an unmatched name opens the in-session picker, and a blocked mic says so", async ({
  page,
}) => {
  await startSession(page, [EX, OTHER]);
  const picked = page.getByTestId(`block-${OTHER}`);

  await speak(page, "incline dumbbell press 135 for 8");

  // No confident match → ask instead of guessing. The prefilled spoken name
  // matches no block name, so the picker falls back to the whole session.
  await expect(page.getByTestId("voice-picker-search")).toHaveValue(
    "incline dumbbell press",
  );
  await expect(page.getByTestId(`voice-pick-${EX}`)).toBeVisible();
  await expect(page.getByTestId(`voice-pick-${OTHER}`)).toBeVisible();
  await shot(page, "06-picker-fallback");

  await page.getByTestId(`voice-pick-${OTHER}`).click();
  await expect(picked.getByTestId("set-0-weight")).toHaveValue("135");
  await expect(picked.getByTestId("set-0-reps")).toHaveValue("8");
  await expect(picked.getByTestId("committed-0")).toHaveCount(0);
  await shot(page, "07-picked-block-filled");

  // A denied mic reads as denied — not as "didn't catch that", which would
  // invite an endless retry.
  await page.getByTestId("voice-log-mic").click();
  await page.evaluate(() => window.__voice.fail("not-allowed"));
  await expect(page.getByRole("status")).toHaveText(/Microphone blocked/);
  await expect(page.getByTestId("voice-log-mic")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await shot(page, "08-mic-blocked-message");
});
