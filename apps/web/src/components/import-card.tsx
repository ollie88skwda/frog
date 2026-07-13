import {
  type ImportedSession,
  type ImportResult,
  parseFitbitSleep,
  parseHevyCsv,
} from "@sbl/core";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/lib/repo";

type HevyState =
  | { phase: "idle" }
  | {
      phase: "parsed";
      sessions: ImportedSession[];
      sets: number;
      exercises: number;
    }
  | { phase: "importing" }
  | { phase: "done"; result: ImportResult }
  | { phase: "error"; message: string };

type SleepState =
  | { phase: "idle" }
  | { phase: "parsed"; map: Map<string, number> }
  | { phase: "applying" }
  | { phase: "done"; filled: number }
  | { phase: "error"; message: string };

export function ImportCard() {
  const repo = useRepo();
  const qc = useQueryClient();
  const hevyFile = useRef<HTMLInputElement>(null);
  const sleepFiles = useRef<HTMLInputElement>(null);
  const [hevy, setHevy] = useState<HevyState>({ phase: "idle" });
  const [sleep, setSleep] = useState<SleepState>({ phase: "idle" });

  async function onHevyFile(file: File | undefined) {
    if (!file) return;
    try {
      const sessions = parseHevyCsv(await file.text());
      const sets = sessions.reduce(
        (n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0),
        0,
      );
      const exercises = new Set(
        sessions.flatMap((s) => s.exercises.map((e) => e.name.toLowerCase())),
      ).size;
      setHevy({ phase: "parsed", sessions, sets, exercises });
    } catch (e) {
      setHevy({
        phase: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function runHevyImport() {
    if (hevy.phase !== "parsed") return;
    setHevy({ phase: "importing" });
    try {
      const result = await repo.importSessions(hevy.sessions);
      setHevy({ phase: "done", result });
      void qc.invalidateQueries();
    } catch (e) {
      setHevy({
        phase: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function onSleepFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const texts = await Promise.all([...files].map((f) => f.text()));
      setSleep({ phase: "parsed", map: parseFitbitSleep(texts) });
    } catch (e) {
      setSleep({
        phase: "error",
        message: e instanceof Error ? e.message : String(e),
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
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">Import</h2>
      <p className="mt-0.5 text-2xs text-faint">
        Bring your history in. Import workouts (Hevy) first, then sleep — sleep
        attaches to sessions that already exist.
      </p>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs font-medium">Hevy workouts (.csv)</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={hevyFile}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onHevyFile(e.target.files?.[0])}
            className="text-xs text-soft file:mr-2 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
            data-testid="import-hevy-input"
          />
          {hevy.phase === "parsed" && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => void runHevyImport()}
              data-testid="import-hevy-btn"
            >
              <Upload className="size-4" />
              Import {hevy.sessions.length} sessions
            </Button>
          )}
        </div>
        <p
          className="num mt-2 text-2xs text-faint"
          data-testid="import-hevy-status"
        >
          {hevy.phase === "parsed" &&
            `${hevy.sessions.length} sessions · ${hevy.sets} sets · ${hevy.exercises} exercises — re-import skips existing`}
          {hevy.phase === "importing" && "Importing…"}
          {hevy.phase === "done" &&
            `Imported ${hevy.result.imported} sessions (${hevy.result.sets} sets, ${hevy.result.exercisesCreated} new exercises) · skipped ${hevy.result.skipped} existing`}
          {hevy.phase === "error" && (
            <span className="text-neg">{hevy.message}</span>
          )}
        </p>
      </div>

      <div className="mt-3 border-t border-border pt-3">
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
            className="text-xs text-soft file:mr-2 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
            data-testid="import-sleep-input"
          />
          {sleep.phase === "parsed" && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => void runSleepApply()}
              data-testid="import-sleep-btn"
            >
              <Upload className="size-4" />
              Apply {sleep.map.size} nights
            </Button>
          )}
        </div>
        <p
          className="num mt-2 text-2xs text-faint"
          data-testid="import-sleep-status"
        >
          {sleep.phase === "parsed" && `${sleep.map.size} nights parsed`}
          {sleep.phase === "applying" && "Applying…"}
          {sleep.phase === "done" &&
            `Filled sleep on ${sleep.filled} sessions (existing values untouched)`}
          {sleep.phase === "error" && (
            <span className="text-neg">{sleep.message}</span>
          )}
        </p>
      </div>
    </div>
  );
}
