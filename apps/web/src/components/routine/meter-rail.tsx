import {
  type ProgramView,
  type ValidationResult,
  validateProgram,
} from "@frog/core";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { inBandCount, meterRows } from "@/components/builder/logic";
import {
  FindingsList,
  SessionStrip,
  WeeklyMeter,
} from "@/components/builder/review";
import { RuleSheet } from "@/components/builder/why-sheet";

/**
 * Collapsed program meter rail for the routine editor (report 8.5): one bar
 * line, tap to open the same weekly meter, per-session strip and findings the
 * builder review uses (`validateProgram`). Never blocks saving (principle 6).
 */
export function ProgramMeterRail({
  view,
  folderName,
}: {
  view: ProgramView;
  folderName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState<{
    rule: string;
    title: string;
    saw: string;
  } | null>(null);
  const validation: ValidationResult = useMemo(
    () => validateProgram(view),
    [view],
  );
  const rows = meterRows(validation.weekly);
  if (rows.length === 0) return null;
  const inBand = inBandCount(rows);
  const heads = validation.findings.filter(
    (f) => f.severity === "heads-up",
  ).length;
  return (
    <section className="mt-4 rounded-md bg-surface-2" data-testid="meter-rail">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left"
        data-testid="meter-rail-toggle"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">
            Weekly sets{folderName ? ` · ${folderName}` : ""}
          </span>
          <span className="num block text-xs text-soft">
            {inBand} of {rows.length} muscles in 10-20
            {heads > 0 ? ` · ${heads} heads-up${heads === 1 ? "" : "s"}` : ""}
          </span>
        </span>
        {open ? (
          <CaretUp aria-hidden="true" className="size-4 text-soft" />
        ) : (
          <CaretDown aria-hidden="true" className="size-4 text-soft" />
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-3 pb-3">
          <WeeklyMeter validation={validation} />
          <SessionStrip sessions={validation.perSession} />
          <FindingsList
            findings={validation.findings}
            onWhy={(f) =>
              setWhy({
                rule: f.rule,
                title: f.code.replace(/_/g, " ").toLowerCase(),
                saw: f.message,
              })
            }
          />
        </div>
      )}
      {why && (
        <RuleSheet
          open
          onOpenChange={(o) => !o && setWhy(null)}
          ruleId={why.rule}
          title={why.title}
          saw={why.saw}
        />
      )}
    </section>
  );
}
