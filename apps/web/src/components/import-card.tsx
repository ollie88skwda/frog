import { parseFitbitSleep } from "@frog/core";
import { UploadSimple } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/lib/repo";
import { userFacingRepoError } from "@/lib/repo-error";
import { useVoice } from "@/lib/voice";

type SleepState =
  | { phase: "idle" }
  | { phase: "parsed"; map: Map<string, number> }
  | { phase: "applying" }
  | { phase: "done"; filled: number }
  | { phase: "error"; message: string };

export function ImportCard() {
  const repo = useRepo();
  const qc = useQueryClient();
  const { t } = useVoice();
  const sleepFiles = useRef<HTMLInputElement>(null);
  const [sleep, setSleep] = useState<SleepState>({ phase: "idle" });

  async function onSleepFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const texts = await Promise.all([...files].map((f) => f.text()));
      setSleep({ phase: "parsed", map: parseFitbitSleep(texts) });
    } catch (e) {
      setSleep({
        phase: "error",
        message: userFacingRepoError(e),
      });
    }
  }

  async function runSleepApply() {
    if (sleep.phase !== "parsed") return;
    setSleep({ phase: "applying" });
    try {
      const filled = await repo.applySleep(sleep.map);
      setSleep({ phase: "done", filled });
      void qc.invalidateQueries();
    } catch (e) {
      setSleep({
        phase: "error",
        message: userFacingRepoError(e),
      });
    }
  }

  return (
    <div className="mt-4 rounded-md bg-surface p-4">
      <h2 className="text-sm font-medium">Import</h2>
      <p className="mt-1 text-2xs text-faint">
        Bring your history in. Import workouts first, then sleep: sleep attaches
        to sessions that already exist.
      </p>

      <Link
        to="/import"
        className="mt-3 flex h-11 items-center justify-center gap-2 rounded-sm bg-secondary text-sm font-medium text-on-secondary hover:bg-active"
        data-testid="import-workouts-link"
      >
        <UploadSimple className="size-4" />
        Import workouts, routines or a screenshot's text
      </Link>
      <p className="mt-1 text-2xs text-faint">
        Hevy, Strong, Fitbod, JEFIT, Frog exports, any CSV, or pasted text.
      </p>

      <div className="mt-3 pt-3">
        <p className="text-xs font-medium">
          Fitbit sleep — Google Takeout (sleep-*.json)
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={sleepFiles}
            type="file"
            accept=".json,application/json"
            multiple
            onChange={(e) => void onSleepFiles(e.target.files)}
            className="text-xs text-soft file:mr-2 file:h-11 file:rounded-sm file:bg-surface-2 file:px-3 file:text-xs file:text-ink"
            data-testid="import-sleep-input"
          />
          {sleep.phase === "parsed" && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => void runSleepApply()}
              data-testid="import-sleep-btn"
            >
              <UploadSimple className="size-4" />
              Apply {sleep.map.size} nights
            </Button>
          )}
        </div>
        <p
          className="num mt-2 text-2xs text-faint"
          data-testid="import-sleep-status"
        >
          {sleep.phase === "parsed" &&
            t(
              `${sleep.map.size} nights parsed`,
              `${sleep.map.size} nights parsed. The frog awaits.`,
            )}
          {sleep.phase === "applying" &&
            t("Applying…", "Applying… the frog is thinking.")}
          {sleep.phase === "done" &&
            t(
              `Filled sleep on ${sleep.filled} sessions (existing values untouched)`,
              `Filled sleep on ${sleep.filled} sessions (existing values untouched). The frog nods, slowly.`,
            )}
          {sleep.phase === "error" && (
            <span className="text-neg">
              {t(
                sleep.message,
                `The frog is annoyed (your data is safe). ${sleep.message}`,
              )}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
