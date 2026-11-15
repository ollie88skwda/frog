import {
  CSV_FIELD_LABELS,
  type CsvField,
  type CsvMapping,
  type FileParseResult,
  genericCsvToDraft,
  type ImportDraft,
  parseImportFile,
  parseWorkoutText,
} from "@frog/core";
import { FileText, UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { ImportReview, type ReviewSummary } from "@/components/import/review";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useUnit } from "@/lib/settings";
import { useVoice } from "@/lib/voice";

// /import — lazy. Step 1 collects a source (pasted text, a file; the
// frog-import-ocr "Screenshot" option mounts next to them and just calls
// `showDraft`), step 2 is the shared <ImportReview>. Everything is parsed on
// this device; nothing leaves it until the user confirms in review.

const FIELDS: CsvField[] = [
  "date",
  "exercise",
  "weight",
  "reps",
  "rir",
  "rpe",
  "title",
  "note",
];
const NONE = "none";

export default function ImportScreen() {
  const { unit } = useUnit();
  const { t } = useVoice();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [file, setFile] = useState<FileParseResult | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [csvUnit, setCsvUnit] = useState<"kg" | "lb">(unit);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReviewSummary | null>(null);

  /** The single hand-off into review. OCR calls this too. */
  function showDraft(d: ImportDraft) {
    setDraft(d);
    setError(null);
  }

  function readText() {
    if (!text.trim()) return;
    setFile(null);
    const d = parseWorkoutText(text, { defaultUnit: unit });
    if (d.sessions.length + d.routines.length === 0) {
      setError(
        t(
          "No workout found in that text. Paste at least an exercise name and one set like 100 kg x 8.",
          "The frog found no workout in that. Give it an exercise and a set like 100 kg x 8.",
        ),
      );
      return;
    }
    showDraft(d);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      const body = await f.text();
      if (/\.txt$/i.test(f.name) || f.type === "text/plain") {
        setText(body);
        const d = parseWorkoutText(body, { defaultUnit: unit });
        if (d.sessions.length + d.routines.length === 0)
          throw new Error("No workout found in that text file.");
        showDraft(d);
        return;
      }
      const r = parseImportFile(body, { defaultUnit: unit });
      if (
        r.draft.sessions.length === 0 &&
        r.format !== "generic-csv" &&
        r.format !== "jefit-csv"
      )
        throw new Error("No sessions found. Is this the right export?");
      setFile(r);
      setMapping(r.mapping ?? {});
      setCsvUnit(unit);
      if (r.draft.sessions.length > 0) showDraft(r.draft);
      else if (r.rows)
        setError("Match the columns below so Frog can read this file.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  function remap(next: CsvMapping, u = csvUnit) {
    setMapping(next);
    if (!file?.rows) return;
    const d = genericCsvToDraft(file.rows, {
      mapping: next,
      unit: u,
      source: file.draft.source,
    });
    setDraft(d.sessions.length ? d : null);
    setError(
      d.sessions.length
        ? null
        : "Pick the date and exercise columns to continue.",
    );
  }

  if (done) {
    const n = done.sessions.imported;
    return (
      <Shell>
        <div className="rounded-md bg-surface p-4" data-testid="import-done">
          <h2 className="text-sm font-medium">Imported</h2>
          <p className="num mt-1 text-xs text-soft">
            {n} sessions ({done.sessions.sets} sets,{" "}
            {done.sessions.exercisesCreated} new exercises)
            {done.routines > 0 && ` · ${done.routines} routines`}
            {done.sessions.skipped > 0 &&
              ` · skipped ${done.sessions.skipped} already in History`}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              to="/history"
              className="flex h-10 flex-1 items-center justify-center rounded-sm bg-action px-3 text-sm font-medium text-on-action"
              data-testid="import-view-history"
            >
              View History
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                setDone(null);
                setDraft(null);
                setFile(null);
                setText("");
              }}
            >
              Import more
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  if (draft) {
    return (
      <Shell>
        {file?.rows && file.draft.source !== "hevy-csv" && file.mapping && (
          <MappingPanel
            headers={file.headers ?? []}
            mapping={mapping}
            unit={csvUnit}
            onChange={remap}
            onUnit={(u) => {
              setCsvUnit(u);
              remap(mapping, u);
            }}
          />
        )}
        <ImportReview
          draft={draft}
          onDraftChange={setDraft}
          onCancel={() => {
            setDraft(null);
            setFile(null);
          }}
          onDone={setDone}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="rounded-md bg-surface p-4">
        <h2 className="text-sm font-medium">Paste text</h2>
        <p className="mt-1 text-xs text-soft">
          Paste a workout from any app or your notes. On iPhone, press and hold
          text in a screenshot and tap Copy (Live Text), then paste it here.
        </p>
        <Textarea
          className="mt-3 min-h-40 font-mono text-xs"
          placeholder={
            "Push day\nNov 12, 2026\nBench Press\n1  100 kg x 8\n2  100 kg x 7"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Workout text"
          data-testid="import-text"
        />
        <Button
          variant="primary"
          className="mt-3 w-full"
          disabled={!text.trim()}
          onClick={readText}
          data-testid="import-read-text"
        >
          <FileText className="size-4" /> Read text
        </Button>
      </section>

      <section className="mt-3 rounded-md bg-surface p-4">
        <h2 className="text-sm font-medium">Upload a file</h2>
        <p className="mt-1 text-xs text-soft">
          Export files from Hevy, Strong, Fitbod, JEFIT or Frog, or any
          spreadsheet saved as CSV.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,.txt,text/csv,text/plain,application/json"
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0])}
          data-testid="import-file-input"
        />
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => fileRef.current?.click()}
          data-testid="import-file-btn"
        >
          <UploadSimple className="size-4" /> Choose a file
        </Button>
      </section>

      {/* frog-import-ocr: the "Screenshot" option renders here and calls showDraft(). */}

      {error && (
        <p className="mt-3 text-xs text-neg" data-testid="import-error">
          {error}
        </p>
      )}
      {file?.rows && file.mapping && (
        <MappingPanel
          headers={file.headers ?? []}
          mapping={mapping}
          unit={csvUnit}
          onChange={remap}
          onUnit={(u) => {
            setCsvUnit(u);
            remap(mapping, u);
          }}
        />
      )}

      <p className="mt-4 px-1 text-2xs text-faint">
        Files and text are read on this device. Nothing is sent or saved until
        you review and tap Import.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-28 md:pb-6">
      <div className="mb-4 flex items-center gap-2">
        <BackButton to="/you?s=settings" label="Back" />
        <h1 className="text-lg font-semibold tracking-tight">Import</h1>
      </div>
      {children}
    </div>
  );
}

function MappingPanel({
  headers,
  mapping,
  unit,
  onChange,
  onUnit,
}: {
  headers: string[];
  mapping: CsvMapping;
  unit: "kg" | "lb";
  onChange: (m: CsvMapping) => void;
  onUnit: (u: "kg" | "lb") => void;
}) {
  return (
    <section
      className="mb-3 mt-3 rounded-md bg-surface p-4"
      data-testid="import-mapping"
    >
      <h2 className="text-sm font-medium">Match columns</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <div key={f} className="min-w-0">
            <p className="mb-1 text-2xs text-faint">{CSV_FIELD_LABELS[f]}</p>
            <Select.Root
              value={mapping[f] == null ? NONE : String(mapping[f])}
              onValueChange={(v) => {
                const next = { ...mapping };
                if (v === NONE) delete next[f];
                else next[f] = Number(v);
                onChange(next);
              }}
            >
              <Select.Trigger
                className="w-full"
                aria-label={CSV_FIELD_LABELS[f]}
              />
              <Select.Content>
                <Select.Item value={NONE}>Not in file</Select.Item>
                {headers.map((h, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: column position is the identity
                  <Select.Item key={i} value={String(i)}>
                    {h || `Column ${i + 1}`}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-soft">
        <span>Weights are in</span>
        {(["kg", "lb"] as const).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={unit === u}
            onClick={() => onUnit(u)}
            className={`h-10 rounded-sm px-3 text-xs font-semibold md:h-8 ${unit === u ? "bg-accent-soft text-accent-ink" : "bg-secondary/60 text-on-secondary"}`}
          >
            {u}
          </button>
        ))}
      </div>
    </section>
  );
}
