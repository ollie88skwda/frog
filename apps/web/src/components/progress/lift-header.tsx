// Lift page header (F7): e1RM · status · best top set · next prescription,
// plus the BandChart with the personal baseline and "within normal swing" band.
import {
  type RecordsSessionInput,
  toDisplayWeight,
  unitLabel,
} from "@frog/core";
import { useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts";
import {
  DeltaChip,
  EvidenceSheet,
  StatTile,
  TierBadge,
} from "@/components/data";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { formatDate } from "@/lib/format";
import { useUnit } from "@/lib/settings";
import { trendYDomain } from "@/lib/trend-domain";
import {
  displayE1rm,
  liftSeries,
  liftVerdict,
  NOT_ESTIMABLE_NOTE,
  noiseBand,
  selfPercentile,
  verdictWord,
} from "./derive";

const CFG = {
  y: { label: "e1RM", color: "var(--chart-mark)" },
} satisfies ChartConfig;

export function LiftHeader({
  exerciseId,
  history,
  nextHint,
}: {
  exerciseId: string;
  history: RecordsSessionInput[];
  /** Next prescription line from the coach; null until J3/J6 provide it. */
  nextHint?: string | null;
}) {
  const { unit } = useUnit();
  const [why, setWhy] = useState(false);
  const now = useMemo(() => Date.now(), []);
  const series = useMemo(
    () => liftSeries(history, exerciseId),
    [history, exerciseId],
  );
  const verdict = liftVerdict(series);
  const band = noiseBand(series.points);
  const pct = selfPercentile(series.points, now);
  const last = series.points[series.points.length - 1];
  const best = series.points.reduce((m, p) => Math.max(m, p.e1rm), 0);
  const data = series.points.map((p) => ({ x: p.at, y: displayE1rm(p.e1rm) }));
  const w = (kg: number) => toDisplayWeight(kg, unit);
  const st = verdict.kind === "status" ? verdict.status : null;

  return (
    <div className="mt-4" data-testid="lift-header">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="e1RM (Brzycki)"
          value={last ? w(displayE1rm(last.e1rm)) : "–"}
          unit={last ? unitLabel(unit) : undefined}
          delta={
            st?.deltaPct != null ? (
              <DeltaChip
                delta={st.deltaPct}
                noise={10}
                unit="%"
                basis="vs your last 6 sessions' median"
              />
            ) : undefined
          }
          basis={last ? "latest session top set" : NOT_ESTIMABLE_NOTE}
          n={series.points.length}
          onClick={() => setWhy(true)}
        />
        <StatTile
          label="Status"
          value={<span className="text-lg">{verdictWord(verdict)}</span>}
          basis={
            verdict.kind === "status" && verdict.rough
              ? `rough: ${series.points.length} of 7 sessions`
              : verdict.kind === "status"
                ? "7+ comparable sessions · beta"
                : verdict.kind === "not_estimable"
                  ? NOT_ESTIMABLE_NOTE
                  : verdict.note
          }
          n={series.sessionsLogged}
          confidence={<TierBadge tier={5} onClick={() => setWhy(true)} />}
        />
        <StatTile
          label="Best top set"
          value={best ? w(displayE1rm(best)) : "–"}
          unit={best ? unitLabel(unit) : undefined}
          basis="highest e1RM, working sets"
        />
        <StatTile
          label="Next time"
          value={<span className="text-sm">{nextHint ?? "–"}</span>}
          basis={
            nextHint
              ? "from your plan"
              : "appears once a plan targets this lift"
          }
        />
      </div>

      {data.length >= 2 ? (
        <div className="mt-3 rounded-md bg-surface p-3">
          <ChartContainer
            config={CFG}
            className="h-44 w-full"
            role="img"
            aria-label={`e1RM trend over ${data.length} sessions${band ? `, normal swing ${w(displayE1rm(band.lo))} to ${w(displayE1rm(band.hi))}` : ""}`}
            data-testid="lift-bandchart"
          >
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="x"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                tickCount={3}
                tickFormatter={(v) => formatDate(Number(v))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={40}
                domain={trendYDomain(data)}
                tickFormatter={(v) => String(w(Number(v)))}
              />
              {band && (
                <ReferenceArea
                  y1={displayE1rm(band.lo)}
                  y2={displayE1rm(band.hi)}
                  fill="var(--color-bg-hover)"
                  fillOpacity={1}
                  ifOverflow="extendDomain"
                />
              )}
              <Area
                dataKey="y"
                stroke="none"
                fill="none"
                isAnimationActive={false}
              />
              <Line
                dataKey="y"
                type="monotone"
                stroke="var(--chart-mark)"
                strokeWidth={2}
                dot={{ r: 2.5, strokeWidth: 0, fill: "var(--chart-mark)" }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
          <p className="mt-1 text-2xs text-soft">
            {band
              ? "Shaded = within 10% of your last-6 median (normal swing). "
              : ""}
            Sessions: {data.length}.
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-md bg-surface p-3 text-xs text-soft">
          {series.points.length === 0 && series.flaggedSets.length > 0
            ? `${NOT_ESTIMABLE_NOTE}.`
            : `Not enough yet (${series.points.length} of 2 sessions for a trend line).`}
        </p>
      )}

      {pct != null && (
        <p
          className="mt-2 px-1 text-xs text-soft"
          data-testid="lift-percentile"
        >
          Your latest top set beats {pct}% of your sessions in the last 52 weeks
          (n={series.points.length}).
        </p>
      )}

      {series.flaggedSets.length > 0 && (
        <div
          className="mt-3 rounded-md bg-surface p-3"
          data-testid="lift-not-used"
        >
          <p className="text-xs font-semibold text-soft">
            Not used for estimate
          </p>
          <ul className="mt-1">
            {series.flaggedSets.slice(-5).map((f) => (
              <li
                key={`${f.sessionId}-${f.weightKg}-${f.reps}`}
                className="num text-xs text-soft"
              >
                {formatDate(f.at)}: {w(f.weightKg)} {unitLabel(unit)} × {f.reps}
                : {f.totalReps} total reps, over 10
              </li>
            ))}
          </ul>
        </div>
      )}
      {series.noRirSets > 0 && (
        <p className="mt-2 px-1 text-2xs text-soft">
          {series.noRirSets} set{series.noRirSets === 1 ? "" : "s"} had no RIR,
          so they were treated as 0 RIR (a lower bound).
        </p>
      )}

      <EvidenceSheet
        open={why}
        onOpenChange={setWhy}
        title="How this is estimated"
        saw={
          <p className="num text-sm">
            {series.points.length} estimable session
            {series.points.length === 1 ? "" : "s"}
            {last
              ? `, latest ${w(displayE1rm(last.e1rm))} ${unitLabel(unit)}`
              : ""}
            .
          </p>
        }
        ruleId="C2c"
        rule="e1RM = load × 36 / (37 − (reps + RIR)), only for sets of 10 or fewer total reps. A change under 10% is normal swing. A stall check needs 7 comparable sessions; earlier verdicts are rough."
        tier={5}
        tierNote="Brzycki is a standard formula; RIR is an estimate (about ±1 rep), so treat e1RM as a trend signal, not a true max. The 7-session stall rule is untested on real logs, so it is labelled beta."
        flags={["Beta"]}
      />
    </div>
  );
}
