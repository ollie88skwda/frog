import type {
  ProgramFinding,
  SessionSummary,
  ValidationResult,
} from "@frog/core";
import { Warning } from "@phosphor-icons/react";
import {
  MuscleMeter,
  SectionHeader,
  type Tier,
  TierBadge,
} from "@/components/data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { inBandCount, meterRows, sessionStrip } from "./logic";

const tierNum = (t: string) => Number(t.slice(1)) as Tier;

/** Weekly fractional sets per muscle against the 10-20 starting band (R6, R7). */
export function WeeklyMeter({
  validation,
  onMuscle,
}: {
  validation: ValidationResult;
  onMuscle?: (muscle: string) => void;
}) {
  const rows = meterRows(validation.weekly);
  if (rows.length === 0) {
    return <p className="px-4 py-3 text-xs text-soft">No sets yet.</p>;
  }
  return (
    <div data-testid="weekly-meter">
      <p className="px-4 pb-1 text-xs text-soft">
        <span className="num">{inBandCount(rows)}</span> of{" "}
        <span className="num">{rows.length}</span> muscles in the 10-20 starting
        range. Direct sets count 1, indirect 0.5. A starting range, not a
        landmark.
      </p>
      {rows.map((r) => (
        <MuscleMeter
          key={r.muscle}
          label={r.label}
          sets={r.total}
          onClick={onMuscle ? () => onMuscle(r.muscle) : undefined}
        />
      ))}
    </div>
  );
}

/** Max direct sets per muscle in each session (R7b planning range 2-5, never a cap). */
export function SessionStrip({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <ul className="flex flex-col" data-testid="session-strip">
      {sessions.map((s) => {
        const strip = sessionStrip(s.top);
        return (
          <li
            key={s.id}
            className="flex min-h-11 items-center justify-between gap-2 px-4 text-sm"
          >
            <span className="min-w-0 truncate font-semibold text-ink">
              {s.name}
            </span>
            <span className="num flex shrink-0 items-center gap-2 text-xs text-soft">
              {s.totalSets} sets
              {strip && (
                <span>
                  top: {strip.label} {strip.sets}
                </span>
              )}
              {strip?.chip && (
                <span
                  className="inline-flex h-5 items-center rounded-xs bg-attn-soft px-1.5 text-2xs font-semibold text-attn"
                  data-testid="cap-chip"
                >
                  planning range is 2-5
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Heads-ups and info, each with a tier badge, a Why, and an optional one-tap fix. */
export function FindingsList({
  findings,
  onWhy,
  onFix,
}: {
  findings: ProgramFinding[];
  onWhy: (f: ProgramFinding) => void;
  onFix?: (f: ProgramFinding) => void;
}) {
  if (findings.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-soft">
        Nothing to flag. Every check passed; none of them ever blocks saving.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2 px-4" data-testid="findings">
      {findings.map((f, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: findings can repeat the same code+target
          key={`${f.code}-${f.target.muscle ?? ""}-${f.target.slot ?? ""}-${f.target.session ?? ""}-${i}`}
          className="flex flex-col gap-2 rounded-md bg-surface-2 p-3"
        >
          <div className="flex items-start gap-2">
            {f.severity === "heads-up" && (
              <Warning
                aria-hidden="true"
                weight="fill"
                className="mt-0.5 size-4 shrink-0 text-attn"
              />
            )}
            <p
              className={cn(
                "text-sm",
                f.severity === "heads-up" ? "text-ink" : "text-soft",
              )}
            >
              {f.message}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={tierNum(f.tier)} onClick={() => onWhy(f)} />
            <Button size="sm" variant="ghost" onClick={() => onWhy(f)}>
              Why?
            </Button>
            {f.fix && onFix && (
              <Button
                size="sm"
                variant="accent"
                className="ml-auto"
                onClick={() => onFix(f)}
                data-testid={`fix-${f.code}`}
              >
                {f.fix.label}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export { SectionHeader };
