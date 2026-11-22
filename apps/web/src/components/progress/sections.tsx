import {
  averageConfidence,
  bodyweightAverage7d,
  computeStreak,
  confidenceLevel,
  FIRST_WEEKDAY,
  muscleLabel,
  roundBodyweightDisplay,
  toDisplayWeight,
  unitLabel,
  volumeConfidence,
  weeklyBodyweightRatePct,
} from "@frog/core";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { HumanBodyHeatmap } from "@/components/charts/human-body-heatmap";
import {
  ConfidenceBadge,
  DeltaChip,
  EmptyState,
  InfoNote,
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
  type ProgressScope,
  rirCoverage,
  scopeSessions,
  sessionCount,
  type VolumeWindow,
  verdictWord,
  volumeRows,
  weeklyHardSets,
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
function mainLifts(
  history: ProgressData["history"],
  scope: ProgressScope,
  now: number,
) {
  const counts = new Map<string, number>();
  for (const s of scopeSessions(history, scope, now))
    for (const b of s.exercises)
      if (b.exerciseType === "weight_reps")
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
    const ids = mainLifts(d.history, "all", now).slice(0, 8);
    let progressing = 0;
    let judged = 0;
    const scores = [];
    for (const id of ids) {
      const v = liftVerdict(liftSeries(d.history, id));
      if (v.kind === "status" && v.score) {
        judged += 1;
        scores.push(v.score);
        if (v.claim === "up" && v.score.pct >= 50) progressing += 1;
      }
    }
    return {
      progressing,
      judged,
      total: ids.length,
      avg: averageConfidence(scores),
    };
  }, [d.history, now]);
  const cov = rirCoverage(scopeSessions(d.history, scope, now));
  const bw = bodyweightEntries(d.measurements);
  const avg = bodyweightAverage7d(bw, now);
  const rate = weeklyBodyweightRatePct(bw, now);
  const streak = computeStreak(
    d.history.map((s) => s.startedAt),
    FIRST_WEEKDAY,
    now,
  );

  const nSets = d.history.filter((s) => s.startedAt > now - 7 * DAY).length;
  return (
    <div className="grid grid-cols-2 gap-3 px-4" data-testid="progress-tiles">
      <StatTile
        emphasis
        label="Hard sets, 7 days"
        value={Math.round(vol.hardSets * 10) / 10}
        delta={
          <DeltaChip
            delta={vol.hardSets - prev.hardSets}
            noise={1}
            basis="vs the 7 days before"
          />
        }
        basis="vs prior 7 days"
        info={
          <>
            <p>
              Working sets at 4 RIR or closer, compared with the 7 days before.
              Warm-ups never count.
            </p>
            <p className="num text-soft">n={nSets} sessions</p>
          </>
        }
        onClick={() => go("volume")}
      />
      <StatTile
        emphasis
        label="Sessions, 7 days"
        value={sessions7}
        delta={
          <DeltaChip
            delta={sessions7 - sessionsPrev}
            noise={0}
            basis="vs the 7 days before"
          />
        }
        basis="vs prior 7 days"
        info={
          <>
            <p>
              Sessions logged in the last 7 days, compared with the 7 before.
            </p>
            <p className="num text-soft">n={sessions7} sessions</p>
          </>
        }
      />
      <StatTile
        emphasis
        label="Lifts progressing"
        value={lifts.judged ? `${lifts.progressing}/${lifts.judged}` : "–"}
        basis={
          !lifts.judged
            ? "log a lift twice"
            : lifts.avg != null && lifts.avg < 50
              ? "tentative guess"
              : "best guess"
        }
        confidence={
          lifts.avg != null && (
            <ConfidenceBadge
              score={{ pct: lifts.avg, level: confidenceLevel(lifts.avg) }}
            />
          )
        }
        info={
          <>
            <p>
              A best guess per lift, with a confidence percentage that rises as
              you log more sessions of each lift.
              {!lifts.judged && " Log a lift twice for a first read."}
            </p>
            <p className="num text-soft">n={lifts.total} lifts</p>
          </>
        }
        onClick={() => go("strength")}
      />
      <StatTile
        emphasis
        label="RIR logged"
        value={cov.coverage == null ? "–" : pctText(cov.coverage * 100)}
        basis="of working sets"
        info={
          <>
            <p>Share of working sets in this scope that have an RIR logged.</p>
            <p className="num text-soft">n={cov.n} sets</p>
          </>
        }
        onClick={() => go("effort")}
      />
      <StatTile
        emphasis
        label="Bodyweight"
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
        basis={avg.kg == null ? "7-day avg · need 4 weigh-ins" : "7-day avg"}
        info={
          <>
            <p>
              {avg.kg == null
                ? "Not enough yet: the average needs 4 weigh-ins in the last 7 days."
                : "Mean of your weigh-ins in the last 7 days, with the weekly rate of change."}
            </p>
            <p className="num text-soft">
              n={avg.n} weigh-ins · {Math.min(avg.n, 4)} of 4 needed
            </p>
          </>
        }
        onClick={() => go("body")}
      />
      <StatTile
        emphasis
        label="Weekly streak"
        value={streak.weeks}
        unit={streak.weeks === 1 ? "wk" : "wks"}
        basis="weeks with a session"
        info={
          <>
            <p>Consecutive weeks (Sunday start) with at least one session.</p>
            <p className="num text-soft">n={d.history.length} sessions</p>
          </>
        }
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
  const lifts = useMemo(
    () =>
      mainLifts(d.history, scope, now)
        .slice(0, 12)
        .map((id) => {
          const s = liftSeries(d.history, id);
          return { id, s, v: liftVerdict(s) };
        }),
    [d.history, scope, now],
  );
  if (!lifts.length)
    return (
      <EmptyState
        title="No lifts in this scope"
        need="Log a weighted exercise twice to see its first strength read, with a confidence percentage."
      />
    );
  const minAt = scopeSessions(d.history, scope, now)[0]?.startedAt ?? 0;
  return (
    <Block>
      {lifts.map(({ id, s, v }) => {
        const pts = s.points.filter((p) => p.at >= minAt).map((p) => p.e1rm);
        const name = d.names.get(id) ?? "Exercise";
        if (v.kind !== "status")
          return (
            <SparkRow
              key={id}
              title={name}
              sub={
                v.kind === "not_estimable"
                  ? "needs 10 or fewer total reps"
                  : v.note
              }
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
            sub={
              v.score
                ? `${verdictWord(v)} · ${v.score.pct}%${v.score.level === "low" ? " tentative" : ""}`
                : `${verdictWord(v)} · n=${st.n}`
            }
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
  const weekly = useMemo(
    () =>
      open
        ? volumeConfidence(
            weeklyHardSets(d.history, d.muscles, open, now, d.rirMax),
          )
        : null,
    [d.history, d.muscles, open, now, d.rirMax],
  );
  const overall = useMemo(() => {
    const scores = r.rows.flatMap((m) => {
      const c = volumeConfidence(
        weeklyHardSets(d.history, d.muscles, m.muscle, now, d.rirMax),
      );
      return c ? [c.score] : [];
    });
    const pct = averageConfidence(scores);
    return pct == null ? null : { pct, muscles: scores.length };
  }, [r.rows, d.history, d.muscles, now, d.rirMax]);
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
                quiet
                onClick={() => setOpen(m.muscle)}
              />
            ))
          )}
        </Block>
      </div>
      {overall && (
        <div className="flex items-center gap-2 px-4 pt-2 text-xs text-soft">
          <ConfidenceBadge
            score={{ pct: overall.pct, level: confidenceLevel(overall.pct) }}
            showWord
          />
          <span>
            avg of {overall.muscles} muscle{overall.muscles === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {(r.noRirSets > 0 || r.unmapped > 0) && (
        <div className="flex items-center gap-2 px-4 pt-2 text-xs text-soft">
          <InfoNote title="Sets not fully counted">
            {r.noRirSets > 0 && (
              <p>{Math.round(r.noRirSets)} sets without RIR counted as hard.</p>
            )}
            {r.unmapped > 0 && (
              <p>
                {Math.round(r.unmapped)} sets on exercises with no muscle map
                are not shown.
              </p>
            )}
          </InfoNote>
          <span>some sets not fully counted</span>
        </div>
      )}
      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          title={open ? muscleLabel(open) : ""}
          aria-describedby={undefined}
        >
          {weekly && (
            <div className="mb-3 flex flex-col gap-2">
              <ConfidenceBadge score={weekly.score} showWord />
              <p className="text-xs text-ink">{weekly.score.basis}</p>
              {weekly.score.level === "low" && (
                <p className="text-xs text-attn">
                  Tentative: a first guess, not a fact.
                </p>
              )}
              <p className="text-xs text-soft">{weekly.score.raise}</p>
              <p className="text-2xs text-soft">{weekly.score.formula}</p>
            </div>
          )}
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
  const ids = useMemo(
    () => mainLifts(d.history, scope, now).slice(0, 10),
    [d.history, scope, now],
  );
  return (
    <>
      <div className="num px-4 pb-2 text-xs text-soft">
        {cov.coverage == null
          ? "No working sets in this scope."
          : `RIR logged on ${pctText(cov.coverage * 100)} of ${cov.n} working sets`}
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
                <span className="num flex gap-2 text-sm text-ink">
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
              ? "need 4 weigh-ins"
              : `7-day avg${rate == null ? "" : ` · ${rate > 0 ? "+" : ""}${rate.toFixed(2)}%/wk`}`
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
              sub={pts.length < 2 ? "need 2 entries" : `${pts.length} entries`}
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
          className="inline-flex h-11 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary hover:bg-hover md:h-8"
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
            need="Log a condition (sleep, carbs, stress) on a few sessions and the first guess shows up here with a confidence percentage. It needs an effect of at least 5%."
          />
        ) : (
          f.conditions.map((c) => (
            <button
              type="button"
              key={`${c.conditionId}-${JSON.stringify(c.outcome)}`}
              className="flex w-full flex-col gap-1 px-4 py-2 text-left hover:bg-surface-hover"
              onClick={() => setOpen(c)}
            >
              <span className="block truncate text-sm font-semibold">
                {c.outcome.type === "e1rm"
                  ? `${c.outcome.exerciseName} e1RM`
                  : "Session"}
              </span>
              <span className="text-sm">
                <span className="num font-semibold">
                  {c.pctDiff > 0 ? "+" : ""}
                  {c.pctDiff.toFixed(1)}%
                </span>{" "}
                <span className="text-soft">
                  on high {c.conditionName} days
                </span>
              </span>
              <span className="num flex items-center gap-2 text-2xs text-soft">
                <ConfidenceBadge
                  score={c.score}
                  showWord={c.score.level === "low"}
                />
                n={c.n.high} high / {c.n.low} low
                <TierBadge tier={5} />
              </span>
            </button>
          ))
        )}
      </Block>
      {f.conditionCountdowns.length > 0 && (
        <p className="px-4 pt-2 text-2xs text-soft">
          Log {f.conditionCountdowns[0].conditionName} on more sessions and a
          first guess appears here.
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2 overflow-hidden rounded-md bg-surface">
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
          data-testid="finding-sheet"
        >
          {open && (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex flex-col gap-2 rounded-sm bg-surface-2 p-3">
                <ConfidenceBadge score={open.score} showWord />
                <p className="text-xs text-ink">{open.score.basis}</p>
                {open.score.level === "low" && (
                  <p className="text-xs text-attn">
                    Tentative: a first guess, not a fact.
                  </p>
                )}
                <p className="text-xs text-soft">{open.score.raise}</p>
                <p className="text-2xs text-soft">{open.score.formula}</p>
              </div>
              <p>
                High-day median-split mean{" "}
                {toDisplayWeight(Math.round(open.highMean * 2) / 2, unit)} vs
                low {toDisplayWeight(Math.round(open.lowMean * 2) / 2, unit)}{" "}
                {unitLabel(unit)}.
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
