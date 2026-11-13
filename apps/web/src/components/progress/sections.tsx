import {
  bodyweightAverage7d,
  computeStreak,
  FIRST_WEEKDAY,
  muscleLabel,
  roundBodyweightDisplay,
  toDisplayWeight,
  unitLabel,
  weeklyBodyweightRatePct,
} from "@frog/core";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { HumanBodyHeatmap } from "@/components/charts/human-body-heatmap";
import {
  DeltaChip,
  EmptyState,
  MuscleMeter,
  Spark,
  SparkRow,
  StatTile,
  TierBadge,
} from "@/components/data";
import { ChipGroup, ChipItem, ToggleChip } from "@/components/ui/chip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { rowClass } from "@/components/ui/row";
import { computeFindings } from "@/lib/findings";
import { useFindingsData, useMetrics } from "@/lib/queries";
import { useUnit } from "@/lib/settings";
import {
  bodyweightEntries,
  lastRirs,
  liftSeries,
  liftVerdict,
  muscleContributions,
  NOT_ESTIMABLE_NOTE,
  type ProgressScope,
  rirCoverage,
  scopeSessions,
  sessionCount,
  type VolumeWindow,
  verdictWord,
  volumeRows,
} from "./derive";
import type { ProgressData } from "./use-progress";

const DAY = 86_400_000;
const pctText = (n: number) => `${Math.round(n)}%`;

function Block({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md bg-surface">{children}</div>
  );
}

/** Lifts ordered by how often they were logged in the scope (the pinned main lifts). */
function mainLifts(d: ProgressData, scope: ProgressScope, now: number) {
  const counts = new Map<string, number>();
  for (const s of scopeSessions(d.history, scope, now))
    for (const b of s.exercises)
      if (b.exerciseType === "weight_reps" || b.exerciseType.includes("weight"))
        if (b.sets.some((x) => x.setType !== "warmup"))
          counts.set(b.exerciseId, (counts.get(b.exerciseId) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// ── Overview tiles (F6): every tile carries a basis label and n ─────────────
export function OverviewTiles({
  d,
  scope,
  now,
  go,
}: {
  d: ProgressData;
  scope: ProgressScope;
  now: number;
  go: (section: string) => void;
}) {
  const { unit } = useUnit();
  const vol = useMemo(
    () => volumeRows(d.history, d.muscles, "7d", now, d.rirMax),
    [d.history, d.muscles, now, d.rirMax],
  );
  const prev = useMemo(
    () => volumeRows(d.history, d.muscles, "prev7d", now, d.rirMax),
    [d.history, d.muscles, now, d.rirMax],
  );
  const sessions7 = sessionCount(d.history, now - 7 * DAY, now + 1);
  const sessionsPrev = sessionCount(d.history, now - 14 * DAY, now - 7 * DAY);
  const lifts = useMemo(() => {
    const ids = mainLifts(d, "all", now).slice(0, 8);
    let progressing = 0;
    let judged = 0;
    for (const id of ids) {
      const v = liftVerdict(liftSeries(d.history, id));
      if (v.kind === "status" && !v.rough) {
        judged += 1;
        if (v.status.state === "progressing") progressing += 1;
      }
    }
    return { progressing, judged, total: ids.length };
  }, [d, now]);
  const cov = rirCoverage(scopeSessions(d.history, scope, now));
  const bw = bodyweightEntries(d.measurements);
  const avg = bodyweightAverage7d(bw, now);
  const rate = weeklyBodyweightRatePct(bw, now);
  const streak = computeStreak(
    d.history.map((s) => s.startedAt),
    FIRST_WEEKDAY,
    now,
  );

  return (
    <div className="grid grid-cols-2 gap-2 px-4" data-testid="progress-tiles">
      <StatTile
        label="Hard sets, 7 days"
        value={Math.round(vol.hardSets * 10) / 10}
        delta={
          <DeltaChip
            delta={vol.hardSets - prev.hardSets}
            noise={1}
            basis="vs the 7 days before"
          />
        }
        basis="vs previous 7 d"
        n={d.history.filter((s) => s.startedAt > now - 7 * DAY).length}
        onClick={() => go("volume")}
      />
      <StatTile
        label="Sessions, 7 days"
        value={sessions7}
        delta={
          <DeltaChip
            delta={sessions7 - sessionsPrev}
            noise={0}
            basis="vs the 7 days before"
          />
        }
        basis="vs previous 7 d"
        n={sessions7}
      />
      <StatTile
        label="Lifts progressing"
        value={lifts.judged ? `${lifts.progressing}/${lifts.judged}` : "–"}
        basis={
          lifts.judged
            ? "of lifts with 7+ sessions"
            : `Not enough yet (0 of ${lifts.total || "some"} lifts have 7)`
        }
        n={lifts.total}
        onClick={() => go("strength")}
      />
      <StatTile
        label="RIR logged"
        value={cov.coverage == null ? "–" : pctText(cov.coverage * 100)}
        basis="of working sets, in scope"
        n={cov.n}
        onClick={() => go("effort")}
      />
      <StatTile
        label="Bodyweight, 7-day avg"
        value={
          avg.kg == null
            ? "–"
            : toDisplayWeight(roundBodyweightDisplay(avg.kg), unit)
        }
        unit={avg.kg == null ? undefined : unitLabel(unit)}
        delta={
          rate == null ? undefined : (
            <DeltaChip
              delta={rate}
              noise={0.25}
              unit="%/wk"
              goodDirection="none"
              basis="weekly rate"
            />
          )
        }
        basis={
          avg.kg == null
            ? "Not enough yet (need 4 weigh-ins)"
            : "mean of weigh-ins"
        }
        n={avg.n}
        onClick={() => go("body")}
      />
      <StatTile
        label="Weekly streak"
        value={streak.weeks}
        unit={streak.weeks === 1 ? "wk" : "wks"}
        basis="weeks with a session"
        n={d.history.length}
        onClick={() => go("lab")}
      />
    </div>
  );
}

// ── Strength (C2c): SparkRows, status pill, % vs 6-session median ───────────
export function StrengthSection({
  d,
  scope,
  now,
}: {
  d: ProgressData;
  scope: ProgressScope;
  now: number;
}) {
  const navigate = useNavigate();
  const { unit } = useUnit();
  const ids = useMemo(
    () => mainLifts(d, scope, now).slice(0, 12),
    [d, scope, now],
  );
  if (!ids.length)
    return (
      <EmptyState
        title="No lifts in this scope"
        need="Log a weighted exercise to see its strength trend. The check needs 7 sessions of a lift."
      />
    );
  const minAt = scopeSessions(d.history, scope, now)[0]?.startedAt ?? 0;
  return (
    <>
      <Block>
        {ids.map((id) => {
          const s = liftSeries(d.history, id);
          const v = liftVerdict(s);
          const pts = s.points.filter((p) => p.at >= minAt).map((p) => p.e1rm);
          const name = d.names.get(id) ?? "Exercise";
          if (v.kind !== "status")
            return (
              <SparkRow
                key={id}
                title={name}
                sub={v.kind === "not_estimable" ? NOT_ESTIMABLE_NOTE : v.note}
                value={
                  <span className="text-xs text-soft">{verdictWord(v)}</span>
                }
                onClick={() => navigate(`/exercises/${id}`)}
              />
            );
          const last = s.points[s.points.length - 1].e1rm;
          const st = v.status;
          return (
            <SparkRow
              key={id}
              title={name}
              sub={`${verdictWord(v)} · n=${st.n}${v.rough ? " · rough" : ""}`}
              points={pts}
              confidence={v.rough ? "low" : "ok"}
              value={
                <span className="num text-sm font-semibold">
                  {toDisplayWeight(Math.round(last * 2) / 2, unit)}
                </span>
              }
              delta={
                st.deltaPct == null ? undefined : (
                  <DeltaChip
                    delta={st.deltaPct}
                    noise={10}
                    unit="%"
                    basis="vs your last 6 sessions' median"
                  />
                )
              }
              onClick={() => navigate(`/exercises/${id}`)}
            />
          );
        })}
      </Block>
      <p className="px-4 pt-2 text-2xs text-soft">
        e1RM = Brzycki with RIR, sets of 10 or fewer total reps. A change under
        10% reads as normal swing. Verdicts need 7 comparable sessions; earlier
        ones are rough.
      </p>
    </>
  );
}

// ── Volume (F3 full): rolling window, contributions sheet, heat-map toggle ──
export function VolumeSection({ d, now }: { d: ProgressData; now: number }) {
  const [win, setWin] = useState<VolumeWindow>("7d");
  const [heat, setHeat] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const r = useMemo(
    () => volumeRows(d.history, d.muscles, win, now, d.rirMax),
    [d.history, d.muscles, win, now, d.rirMax],
  );
  const sets = useMemo(
    () => Object.fromEntries(r.rows.map((m) => [m.muscle, m.total])),
    [r.rows],
  );
  const contrib = open
    ? muscleContributions(d.history, d.muscles, open, win, now, d.rirMax)
    : [];
  return (
    <>
      <div className="flex items-center gap-1 px-4">
        <ChipGroup
          value={win}
          onValueChange={(v) => v && setWin(v as VolumeWindow)}
          aria-label="Window"
        >
          <ChipItem value="7d">7 days</ChipItem>
          <ChipItem value="prev7d">Prior 7</ChipItem>
          <ChipItem value="4wk">4-wk avg</ChipItem>
        </ChipGroup>
        <ToggleChip
          pressed={heat}
          onClick={() => setHeat((h) => !h)}
          className="ml-auto"
        >
          Body map
        </ToggleChip>
      </div>
      {heat && (
        <div className="mx-4 mt-2 rounded-md bg-surface p-3">
          <HumanBodyHeatmap muscleSets={sets} testId="progress-heatmap" />
        </div>
      )}
      <div className="mt-2">
        <Block>
          {r.rows.length === 0 ? (
            <EmptyState
              title="No hard sets in this window"
              need="Working sets at 4 RIR or closer count. Warm-ups never do."
            />
          ) : (
            r.rows.map((m) => (
              <MuscleMeter
                key={m.muscle}
                label={muscleLabel(m.muscle)}
                sets={m.total}
                onClick={() => setOpen(m.muscle)}
              />
            ))
          )}
        </Block>
      </div>
      <p className="px-4 pt-2 text-2xs text-soft">
        Fractional hard sets: direct 1, indirect 0.5. The 10-20 band is a
        starting range, not a target.
        {r.noRirSets > 0 &&
          ` ${Math.round(r.noRirSets)} sets without RIR counted as hard.`}
        {r.unmapped > 0 &&
          ` ${Math.round(r.unmapped)} sets on exercises with no muscle map are not shown.`}
      </p>
      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          title={open ? muscleLabel(open) : ""}
          aria-describedby={undefined}
        >
          <ul className="flex flex-col gap-1">
            {contrib.map((c) => (
              <li key={c.exerciseId}>
                <Link to={`/exercises/${c.exerciseId}`} className={rowClass()}>
                  <span className="truncate text-sm">
                    {d.names.get(c.exerciseId) ?? "Exercise"}
                  </span>
                  <span className="num text-xs text-soft">
                    {Math.round((c.sets / (win === "4wk" ? 4 : 1)) * 10) / 10} ·{" "}
                    {c.kind}
                  </span>
                </Link>
              </li>
            ))}
            {contrib.length === 0 && (
              <li className="text-xs text-soft">No contributing sets.</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Effort (R11): logged RIR per lift + coverage ────────────────────────────
export function EffortSection({
  d,
  scope,
  now,
}: {
  d: ProgressData;
  scope: ProgressScope;
  now: number;
}) {
  const cov = rirCoverage(scopeSessions(d.history, scope, now));
  const ids = mainLifts(d, scope, now).slice(0, 10);
  return (
    <>
      <div className="px-4 pb-2 text-xs text-soft">
        {cov.coverage == null
          ? "No working sets in this scope."
          : `RIR logged on ${pctText(cov.coverage * 100)} of ${cov.n} working sets. RIR is an estimate, about ±1 rep.`}
      </div>
      <Block>
        {ids.length === 0 ? (
          <EmptyState
            title="Nothing to show"
            need="Log RIR on working sets and it appears here per lift."
          />
        ) : (
          ids.map((id) => {
            const rirs = lastRirs(d.history, id);
            return (
              <div
                key={id}
                className={rowClass({ interactive: false, dense: true })}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {d.names.get(id) ?? "Exercise"}
                </span>
                <span className="num flex gap-1.5 text-sm text-ink">
                  {rirs.map((x, i) => {
                    const ago = rirs.length - i;
                    return (
                      <span
                        key={`${id}-${ago}`}
                        className={x == null ? "text-soft" : undefined}
                      >
                        {x == null ? "–" : Math.round(x * 10) / 10}
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })
        )}
      </Block>
      <p className="px-4 pt-2 text-2xs text-soft">
        Last set's RIR per session, oldest to newest. "–" = not logged.
      </p>
    </>
  );
}

// ── Body (F13 display): weight average + rate, girths as small multiples ────
const GIRTHS: {
  key: "waistCm" | "chestCm" | "bicepLCm" | "thighLCm";
  label: string;
}[] = [
  { key: "waistCm", label: "Waist" },
  { key: "chestCm", label: "Chest" },
  { key: "bicepLCm", label: "Biceps" },
  { key: "thighLCm", label: "Thigh" },
];

export function BodySection({ d, now }: { d: ProgressData; now: number }) {
  const { unit } = useUnit();
  const entries = bodyweightEntries(d.measurements);
  const avg = bodyweightAverage7d(entries, now);
  const rate = weeklyBodyweightRatePct(entries, now);
  const chrono = [...d.measurements].reverse();
  return (
    <>
      <Block>
        <SparkRow
          title="Bodyweight"
          sub={
            avg.kg == null
              ? `Not enough yet (${avg.n} of 4 weigh-ins this week)`
              : `7-day average · n=${avg.n}${rate == null ? "" : ` · ${rate > 0 ? "+" : ""}${rate.toFixed(2)}%/wk`}`
          }
          points={entries.slice(-20).map((e) => e.kg)}
          value={
            <span className="num text-sm font-semibold">
              {avg.kg == null
                ? "–"
                : toDisplayWeight(roundBodyweightDisplay(avg.kg), unit)}
            </span>
          }
        />
        {GIRTHS.map((g) => {
          const pts = chrono
            .map((m) => m[g.key])
            .filter((x): x is number => x != null);
          return (
            <SparkRow
              key={g.key}
              title={g.label}
              sub={
                pts.length < 2
                  ? "Not enough yet (2 entries)"
                  : `n=${pts.length}`
              }
              points={pts.slice(-20)}
              value={
                <span className="num text-sm font-semibold">
                  {pts.length ? `${pts[pts.length - 1]} cm` : "–"}
                </span>
              }
            />
          );
        })}
      </Block>
      <div className="px-4 pt-3">
        <Link
          to="/measures"
          className="inline-flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary hover:bg-hover md:h-8"
        >
          Log measurements
        </Link>
      </div>
    </>
  );
}

// ── Lab: condition findings, calendar, recaps ───────────────────────────────
export function LabSection() {
  const fq = useFindingsData();
  const mq = useMetrics();
  const f = useMemo(
    () => computeFindings(fq.data ?? [], mq.data ?? []),
    [fq.data, mq.data],
  );
  const { unit } = useUnit();
  const [open, setOpen] = useState<(typeof f.conditions)[number] | null>(null);
  return (
    <>
      <Block>
        {f.conditions.length === 0 ? (
          <EmptyState
            title="No condition findings yet"
            need="A finding needs about 10 sessions with a condition logged and an effect of at least 5%. Rounded effects, n and medians are shown."
          />
        ) : (
          f.conditions.map((c) => (
            <button
              type="button"
              key={`${c.conditionId}-${JSON.stringify(c.outcome)}`}
              className="flex w-full flex-col gap-0.5 px-4 py-2 text-left hover:bg-surface-hover"
              onClick={() => setOpen(c)}
            >
              <span className="text-sm">
                {c.outcome.type === "e1rm"
                  ? `${c.outcome.exerciseName} e1RM`
                  : "Session"}{" "}
                <span className="num font-semibold">
                  {c.pctDiff > 0 ? "+" : ""}
                  {c.pctDiff.toFixed(1)}%
                </span>{" "}
                <span className="text-soft">
                  on high {c.conditionName} days
                </span>
              </span>
              <span className="num flex items-center gap-1.5 text-2xs text-soft">
                n={c.n.high} high / {c.n.low} low · {c.confidence} confidence ·
                correlation, not causation
                <TierBadge tier={5} />
              </span>
            </button>
          ))
        )}
      </Block>
      {f.conditionCountdowns.length > 0 && (
        <p className="px-4 pt-2 text-2xs text-soft">
          Next: {f.conditionCountdowns[0].sessionsNeeded} more sessions with{" "}
          {f.conditionCountdowns[0].conditionName} logged.
        </p>
      )}
      <div className="mt-3 flex flex-col gap-0.5 overflow-hidden rounded-md bg-surface">
        {[
          ["/calendar", "Consistency calendar"],
          ["/stats/monthly", "Monthly report"],
          ["/stats/year", "Year in review"],
        ].map(([to, label]) => (
          <Link key={to} to={to} className={rowClass()}>
            <span className="text-sm">{label}</span>
          </Link>
        ))}
      </div>
      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          title={open ? `${open.conditionName} finding` : ""}
          aria-describedby={undefined}
        >
          {open && (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                High-day median-split mean {Math.round(open.highMean * 10) / 10}{" "}
                vs low {Math.round(open.lowMean * 10) / 10} kg ({unit} display
                in lists).
              </p>
              <p className="num text-xs text-soft">
                n = {open.n.high} / {open.n.low} · effect size d=
                {open.effectSize.toFixed(2)} · q={open.q.toFixed(2)}
              </p>
              <p className="text-xs text-soft">
                Correlation, not causation. Sleep and stress do not change how
                much you grow; this only shows how your top sets lined up with a
                condition.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Coach (F4): renders "coming" until J3 merges ────────────────────────────
export function CoachSection() {
  return (
    <EmptyState
      title="Weekly review is coming"
      need="Once the coach lands, this shows last week's review: what moved, what to change, and the rule behind it."
    />
  );
}

export { Spark };
