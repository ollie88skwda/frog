import {
  lastPerformedByRoutine,
  suggestRoutineId,
  toDisplayWeight,
} from "@frog/core";
import { Play, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { DeltaChip } from "@/components/data";
import {
  type Readiness,
  ReadinessStrip,
  readinessToConditions,
} from "@/components/readiness-strip";
import { Button } from "@/components/ui/button";
import {
  estimateMinutes,
  formatReps,
  formatRir,
  restartGapDays,
  useCoach,
} from "@/lib/coach-queries";
import { formatDaysAgo, formatTime } from "@/lib/format";
import { useAllSessions } from "@/lib/profile-queries";
import { useActiveProgram } from "@/lib/program-queries";
import { useActiveSession } from "@/lib/queries";
import { useRepo } from "@/lib/repo";
import { userFacingRepoError } from "@/lib/repo-error";
import {
  useRoutineDetail,
  useRoutineFolders,
  useRoutines,
} from "@/lib/routine-queries";
import { useUnit } from "@/lib/settings";
import { useStartRoutineSession, useStartSession } from "@/lib/start-session";
import { cn } from "@/lib/utils";

// Today hero (F5, redesign §8.1). What today is comes from `suggestRoutineId`
// in @frog/core, the same rule the Trainer used (AGENTS.md "What's next"). The
// prescription rows come from useCoach(); readiness entered above is written
// onto the session at start (C1/C7/C9d: readiness before the first set).

const MAX_ROWS = 6;

const CTA =
  "flex h-14 w-full items-center justify-center gap-2 bg-accent text-base font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover disabled:opacity-60";

export function HomeHero() {
  const navigate = useNavigate();
  const repo = useRepo();
  const { unit } = useUnit();
  const { data: active } = useActiveSession();
  const { data: routines = [] } = useRoutines();
  const { data: folders = [] } = useRoutineFolders();
  const { data: program } = useActiveProgram();
  const { data: sessions = [] } = useAllSessions();
  const { start, starting, error } = useStartSession();
  const startRoutine = useStartRoutineSession();
  const [picked, setPicked] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Readiness>({});
  const [skipped, setSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const lastPerformed = useMemo(
    () => lastPerformedByRoutine(sessions),
    [sessions],
  );
  const suggestedId = useMemo(
    () => suggestRoutineId(routines, lastPerformed, program?.folderId),
    [routines, lastPerformed, program?.folderId],
  );
  const selectedId =
    picked && routines.some((r) => r.id === picked) ? picked : suggestedId;
  const selected = routines.find((r) => r.id === selectedId) ?? null;
  const { data: detail } = useRoutineDetail(active ? null : selectedId);
  const coach = useCoach(active ? null : selectedId);

  const programFolder =
    program && selected?.folderId === program.folderId
      ? (folders.find((f) => f.id === program.folderId) ?? null)
      : null;

  // C15: 2+ weeks since any completed session.
  const lastEnded = useMemo(
    () =>
      sessions.reduce<number | null>(
        (m, s) =>
          s.endedAt != null && (m == null || s.endedAt > m) ? s.endedAt : m,
        null,
      ),
    [sessions],
  );
  const gap = restartGapDays(lastEnded);

  async function startSelected() {
    if (!selected || busy) return;
    setBusy(true);
    setStartError(null);
    try {
      const session = await startRoutine(selected.id, coach.overrides);
      const values = skipped ? {} : readinessToConditions(readiness);
      if (Object.keys(values).length > 0) {
        await repo.updateSessionConditions(session.id, values);
      }
      navigate(`/session/${session.id}`);
    } catch (e) {
      setStartError(userFacingRepoError(e));
      setBusy(false);
    }
  }

  if (active) {
    return (
      <section
        className="mt-4 rounded-md bg-surface p-4"
        data-testid="home-hero"
      >
        <p className="text-2xs font-medium tracking-widest text-faint uppercase">
          Session in progress
        </p>
        <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">
          {active.title ?? "Workout"}
        </h2>
        <p className="num mt-1 text-2xs text-faint">
          started {formatTime(active.startedAt)}
        </p>
        <button
          type="button"
          className={cn(CTA, "mt-4")}
          onClick={() => navigate(`/session/${active.id}`)}
          data-testid="hero-resume-btn"
        >
          <Play className="size-5" /> Resume session
        </button>
      </section>
    );
  }

  if (routines.length === 0) {
    return (
      <section
        className="mt-4 rounded-md bg-surface p-4"
        data-testid="home-hero"
      >
        <h2 className="text-2xl font-semibold tracking-tight">
          Pick how you train
        </h2>
        <p className="mt-1 text-sm text-soft">Takes a minute.</p>
        <button
          type="button"
          className={cn(CTA, "mt-4")}
          onClick={() => navigate("/plan/build")}
          data-testid="hero-build-btn"
        >
          <Plus className="size-5" /> Build my program
        </button>
        <Button
          variant="outline"
          className="mt-2 w-full"
          disabled={starting}
          onClick={() => void start()}
          data-testid="start-session-btn"
        >
          {starting ? "Starting…" : "Start empty workout"}
        </Button>
        {error && <p className="mt-2 text-xs text-neg">{error}</p>}
      </section>
    );
  }

  const rows = coach.prescriptions.slice(0, MAX_ROWS);
  const more = coach.prescriptions.length - rows.length;
  const lastAt = selected ? lastPerformed.get(selected.id) : undefined;

  return (
    <>
      {gap != null && (
        <div
          className="mt-4 rounded-md bg-attn-soft px-4 py-3 text-sm text-attn"
          data-testid="restart-banner"
        >
          <span className="num font-semibold">{gap} days</span> since your last
          session. Consider restarting near 80-90% of your previous loads and
          rebuilding.
        </div>
      )}

      <ReadinessStrip
        value={readiness}
        onChange={setReadiness}
        skipped={skipped}
        onSkip={() => setSkipped((s) => !s)}
      />

      <section
        className="mt-4 overflow-hidden rounded-md bg-surface"
        data-testid="home-hero"
      >
        <div className="bg-accent-soft px-4 py-2">
          <span className="text-2xs font-medium tracking-widest text-accent-ink uppercase">
            {programFolder
              ? `Next in ${programFolder.name}`
              : "Today's session"}
          </span>
        </div>
        <div className="px-4 pt-3">
          <h2
            className="truncate text-2xl font-semibold tracking-tight"
            data-testid="hero-plan-name"
          >
            {selected?.name}
          </h2>
          <p className="num mt-0.5 text-xs text-soft">
            {detail
              ? `~${estimateMinutes(detail)} min · ${detail.exercises.length} lift${detail.exercises.length === 1 ? "" : "s"} · `
              : ""}
            {lastAt == null ? "never run" : `last ${formatDaysAgo(lastAt)}`}
          </p>

          {/* Fixed height while loading so the hero never jumps under the thumb. */}
          {coach.isLoading && (
            <ul className="mt-3 flex flex-col gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-11 w-full bg-translucent" />
              ))}
            </ul>
          )}

          <ul className="mt-2 flex flex-col">
            {rows.map((p) => {
              const reps = formatReps(p);
              const rir = formatRir(p);
              return (
                <li
                  key={p.routineExerciseId}
                  className="flex min-h-11 items-center justify-between gap-3 py-1"
                  data-testid="prescription-row"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {p.exerciseName}
                  </span>
                  <span className="num shrink-0 text-xs text-soft">
                    {p.loadKg != null && (
                      <>
                        {toDisplayWeight(p.loadKg, unit)} {unit}{" "}
                      </>
                    )}
                    {p.sets}
                    {reps ? ` × ${reps}` : " sets"}
                    {rir ? ` ${rir}` : ""}
                  </span>
                  {p.deltaKg != null && (
                    <DeltaChip
                      delta={p.deltaKg}
                      unit={unit}
                      basis="vs last session"
                    />
                  )}
                </li>
              );
            })}
            {more > 0 && (
              <li className="num pb-1 text-2xs text-faint">+{more} more</li>
            )}
          </ul>

          <button
            type="button"
            className={cn(CTA, "mt-3 rounded-sm")}
            disabled={!selected || busy}
            onClick={() => void startSelected()}
            data-testid="home-start-btn"
          >
            <Play className="size-5 shrink-0" />
            <span className="truncate">
              {busy ? "Starting…" : `Start ${selected?.name ?? ""}`}
            </span>
          </button>
          {startError && <p className="mt-2 text-xs text-neg">{startError}</p>}
        </div>

        <div className="px-4 py-3">
          <p className="text-2xs font-medium tracking-widest text-faint uppercase">
            Or run
          </p>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
            {routines.map((r) => {
              const at = lastPerformed.get(r.id);
              const isSelected = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  type="button"
                  ref={
                    isSelected
                      ? (el) =>
                          el?.scrollIntoView({
                            block: "nearest",
                            inline: "center",
                          })
                      : undefined
                  }
                  onClick={() => setPicked(r.id)}
                  aria-pressed={isSelected}
                  data-testid={`hero-pick-${r.name}`}
                  className={cn(
                    "min-h-11 w-36 shrink-0 rounded-sm p-2 text-left transition-colors duration-150",
                    isSelected
                      ? "bg-accent-soft"
                      : "bg-surface-2 hover:bg-surface-hover",
                  )}
                >
                  <span className="block truncate text-xs font-medium">
                    {r.name}
                  </span>
                  <span className="num block text-2xs text-faint">
                    {at == null ? "never run" : formatDaysAgo(at)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <Button
        variant="outline"
        className="mt-3 w-full"
        disabled={starting}
        onClick={() => void start()}
        data-testid="start-session-btn"
      >
        {starting ? "Starting…" : "Start empty workout"}
      </Button>
      {error && <p className="mt-2 text-xs text-neg">{error}</p>}
    </>
  );
}
