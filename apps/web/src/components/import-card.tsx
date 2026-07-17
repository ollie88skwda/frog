import {
  type ImportedSession,
  type ImportResult,
  parseFitbitSleep,
  parseHevyCsv,
  parseStrongCsv,
} from "@sbl/core";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/lib/repo";
import { useVoice } from "@/lib/voice";

type CsvState =
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

/** A workout-history CSV importer (Hevy, Strong): parse → preview counts →
 * import. Two providers, one flow — idempotent by session start time, so a
 * re-import skips sessions that already exist. */
function WorkoutCsvImport({
  label,
  hint,
  parse,
  testid,
}: {
  label: string;
  hint: string;
  parse: (text: string) => ImportedSession[];
  testid: string;
}) {
  const repo = useRepo();
  const qc = useQueryClient();
  const { t } = useVoice();
  const [state, setState] = useState<CsvState>({ phase: "idle" });

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const sessions = parse(await file.text());
      if (sessions.length === 0) {
        setState({
          phase: "error",
          message: "No sessions found — is this the right export?",
        });
        return;
      }
      const sets = sessions.reduce(
        (n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0),
        0,
      );
      const exercises = new Set(
        sessions.flatMap((s) => s.exercises.map((e) => e.name.toLowerCase())),
      ).size;
      setState({ phase: "parsed", sessions, sets, exercises });
    } catch (e) {
      setState({
        phase: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function runImport() {
    if (state.phase !== "parsed") return;
    setState({ phase: "importing" });
    try {
      const result = await repo.importSessions(state.sessions);
      setState({ phase: "done", result });
      void qc.invalidateQueries();
    } catch (e) {
      setState({
        phase: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-0.5 text-2xs text-faint">{hint}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="text-xs text-soft file:mr-2 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
          data-testid={`import-${testid}-input`}
        />
        {state.phase === "parsed" && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => void runImport()}
            data-testid={`import-${testid}-btn`}
          >
            <Upload className="size-4" />
            Import {state.sessions.length} sessions
          </Button>
        )}
      </div>
      <p
        className="num mt-2 text-2xs text-faint"
        data-testid={`import-${testid}-status`}
      >
        {state.phase === "parsed" &&
          t(
            `${state.sessions.length} sessions · ${state.sets} sets · ${state.exercises} exercises — re-import skips existing`,
            `${state.sessions.length} sessions · ${state.sets} sets · ${state.exercises} exercises. Re-import skips existing; the frog does not double-count.`,
          )}
        {state.phase === "importing" &&
          t("Importing…", "Importing… the frog is thinking.")}
        {state.phase === "done" &&
          t(
            `Imported ${state.result.imported} sessions (${state.result.sets} sets, ${state.result.exercisesCreated} new exercises) · skipped ${state.result.skipped} existing`,
            `Recorded: ${state.result.imported} sessions (${state.result.sets} sets, ${state.result.exercisesCreated} new exercises) · skipped ${state.result.skipped} existing. The frog nods, slowly.`,
          )}
        {state.phase === "error" && (
          <span className="text-neg">
            {t(
              state.message,
              `The frog is annoyed (your data is safe). ${state.message}`,
            )}
          </span>
        )}
      </p>
    </div>
  );
}

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
        Bring your history in. Import workouts (Hevy or Strong) first, then
        sleep — sleep attaches to sessions that already exist.
      </p>

      <WorkoutCsvImport
        label="Hevy workouts (.csv)"
        hint="Export from Hevy → Settings → Export Data."
        parse={parseHevyCsv}
        testid="hevy"
      />
      <WorkoutCsvImport
        label="Strong workouts (.csv)"
        hint="Export from Strong → Settings → Export Data. Weights convert to kg."
        parse={parseStrongCsv}
        testid="strong"
      />

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
