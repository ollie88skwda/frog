import { expect, type Page, test } from "@playwright/test";
import { createExercise, EMAIL, PASSWORD, rowCount, signIn, waitForExercise } from "./helpers";

// Voice set logging: tap the mic, speak one utterance ("rear delt flies 250
// lbs for 5 reps"), and the CURRENT spotlight fields get filled — never
// committed. The Web Speech API can't be driven by Playwright (Chrome's
// implementation is server-backed and needs real audio), so the recognition
// constructor is stubbed at page init: the app's feature detection, matching,
// unit resolution, picker fallback and error copy are all still the real ones,
// only the audio→transcript hop is replaced.
//
// Re-aimed for the Spotlight session screen (fm/frog-session-spotlight): the
// old multi-block screen showed every exercise's draft row simultaneously,
// so the original spec could assert an unmatched exercise's row stayed
// untouched while the matched one filled. Spotlight shows one exercise at a
// time, and the contract doesn't say whether a spoken match for a
// *non-active* exercise switches the spotlight to it — that's not asserted
// here (contract-silent; see AGENTS.md/PR notes). What's still pinned: a
// confident match fills the active spotlight and never auto-commits, and an
// unmatched name still falls back to the picker.

const EX = "Rear Delt Flyes"; // fuzzy-matched from spoken "rear delt flies"
const OTHER = "Bench Press"; // a global seed exercise, used for the picker-fallback pick

// Screenshots land here when the runner sets it (evidence capture); unset in CI.
const EVIDENCE = process.env.E2E_EVIDENCE_DIR;

async function shot(page: Page, name: string) {
  if (!EVIDENCE) return;
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

async function startSession(page: Page, name: string) {
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${name}`).click();
  await expect(page.getByTestId("weight-field")).toBeVisible();
}

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

test("spoken set fills the active spotlight fields and never commits it", async ({
  page,
}) => {
  await startSession(page, EX);
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

  await expect(page.getByTestId("weight-field")).toHaveValue("250");
  await expect(page.getByTestId("reps-field")).toHaveValue("5");
  await shot(page, "02-filled-not-committed");

  // Filled, not committed: set 0's mark is still open, and nothing was
  // written server-side.
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "current",
  );
  await expect(page.getByTestId("voice-log-mic")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(await rowCount(page, "set_logs")).toBe(before);

  // Committing stays an explicit user action.
  await page.getByTestId("log-set").click();
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
});

test("an unmatched name opens the in-session picker, and a blocked mic says so", async ({
  page,
}) => {
  await startSession(page, EX);

  await page.getByTestId("voice-log-mic").click();
  await page.evaluate(() =>
    window.__voice.say("incline dumbbell press 135 for 8"),
  );

  // No confident match → ask instead of guessing.
  await expect(page.getByTestId("voice-picker-search")).toHaveValue(
    "incline dumbbell press",
  );
  await expect(page.getByTestId(`voice-pick-${EX}`)).toBeVisible();
  await expect(page.getByTestId(`voice-pick-${OTHER}`)).toBeVisible();
  await shot(page, "03-picker-fallback");

  await page.getByTestId(`voice-pick-${OTHER}`).click();
  await expect(page.getByTestId("exercise-name")).toHaveText(OTHER);
  await expect(page.getByTestId("weight-field")).toHaveValue("135");
  await expect(page.getByTestId("reps-field")).toHaveValue("8");
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "current",
  );
  await shot(page, "04-picked-block-filled");

  // A denied mic reads as denied — not as "didn't catch that", which would
  // invite an endless retry.
  await page.getByTestId("voice-log-mic").click();
  await page.evaluate(() => window.__voice.fail("not-allowed"));
  await expect(page.getByRole("status")).toHaveText(/Microphone blocked/);
  await expect(page.getByTestId("voice-log-mic")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await shot(page, "05-mic-blocked-message");
});
