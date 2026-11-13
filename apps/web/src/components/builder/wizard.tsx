import {
  type BuilderAnswers,
  EQUIPMENT_KINDS,
  EQUIPMENT_LABELS,
  type EquipmentKind,
} from "@frog/core";
import { Check } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ToggleChip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import {
  EQUIPMENT_PRESETS,
  equipmentPresetId,
  GOAL_OPTIONS,
  MINUTE_OPTIONS,
  SCHEDULE_OPTIONS,
  STATUS_OPTIONS,
  scheduleOptionId,
  WEEKDAY_SHORT,
} from "./logic";

export const WIZARD_STEPS = [
  "Schedule",
  "Goal",
  "Experience",
  "Equipment",
  "Time",
] as const;

/** One big tap row: visible resting fill, 56px, selected = accent-soft. */
function Option({
  selected,
  label,
  hint,
  onClick,
  testId,
}: {
  selected: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-md px-4 py-2 text-left transition-colors duration-150",
        selected
          ? "bg-accent-soft text-accent-ink"
          : "bg-surface-2 text-ink hover:bg-surface-hover",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-soft">{hint}</span>}
      </span>
      {selected && (
        <Check aria-hidden="true" weight="bold" className="size-4" />
      )}
    </button>
  );
}

function Question({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {note && <p className="text-xs text-soft">{note}</p>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function WizardStep({
  step,
  answers,
  onChange,
}: {
  step: number;
  answers: BuilderAnswers;
  onChange: (next: BuilderAnswers) => void;
}) {
  if (step === 0) {
    const sel = scheduleOptionId(answers.schedule);
    return (
      <Question
        title="How do you want to space training?"
        note="Frog default is every other day. A schedule choice, not shown better or worse at matched volume."
      >
        {SCHEDULE_OPTIONS.map((o) => (
          <Option
            key={o.id}
            selected={sel === o.id}
            label={o.label}
            hint={o.hint}
            testId={`wizard-schedule-${o.id}`}
            onClick={() => onChange({ ...answers, schedule: o.schedule })}
          />
        ))}
        {sel === "custom" && (
          <fieldset className="min-w-0 border-0 p-0 flex flex-wrap gap-1 pt-1">
            <legend className="sr-only">Training weekdays</legend>
            {WEEKDAY_SHORT.map((d, i) => {
              const days =
                answers.schedule.kind === "weekdays"
                  ? answers.schedule.days
                  : [];
              const on = days.includes(i as never);
              return (
                <ToggleChip
                  key={d}
                  pressed={on}
                  onClick={() => {
                    const next = on
                      ? days.filter((x) => x !== i)
                      : [...days, i].sort();
                    if (next.length === 0) return;
                    onChange({
                      ...answers,
                      schedule: { kind: "weekdays", days: next as never },
                    });
                  }}
                >
                  {d}
                </ToggleChip>
              );
            })}
          </fieldset>
        )}
      </Question>
    );
  }
  if (step === 1) {
    return (
      <Question title="What's the goal?">
        {GOAL_OPTIONS.map((o) => (
          <Option
            key={o.id}
            selected={answers.goal === o.id}
            label={o.label}
            hint={o.hint}
            testId={`wizard-goal-${o.id}`}
            onClick={() => onChange({ ...answers, goal: o.id })}
          />
        ))}
      </Question>
    );
  }
  if (step === 2) {
    return (
      <Question
        title="How long have you trained?"
        note="Sets the starting point only. No study sets sets by experience, so this is a practical default."
      >
        {STATUS_OPTIONS.map((o) => (
          <Option
            key={o.id}
            selected={answers.status === o.id}
            label={o.label}
            hint={o.hint}
            testId={`wizard-status-${o.id}`}
            onClick={() => onChange({ ...answers, status: o.id })}
          />
        ))}
      </Question>
    );
  }
  if (step === 3) {
    const sel = equipmentPresetId(answers.equipment);
    return (
      <Question title="What do you have?">
        {EQUIPMENT_PRESETS.map((p) => (
          <Option
            key={p.id}
            selected={sel === p.id}
            label={p.label}
            hint={p.hint}
            testId={`wizard-equip-${p.id}`}
            onClick={() => onChange({ ...answers, equipment: p.equipment })}
          />
        ))}
        <Option
          selected={sel === "custom"}
          label="Custom"
          hint="Pick the kinds you use"
          onClick={() =>
            onChange({
              ...answers,
              equipment: answers.equipment.length
                ? answers.equipment
                : (["dumbbell"] as EquipmentKind[]),
            })
          }
        />
        {sel === "custom" && (
          <fieldset className="min-w-0 border-0 p-0 flex flex-wrap gap-1 pt-1">
            <legend className="sr-only">Equipment</legend>
            {EQUIPMENT_KINDS.map((k) => {
              const on = answers.equipment.includes(k);
              return (
                <ToggleChip
                  key={k}
                  pressed={on}
                  onClick={() => {
                    const next = on
                      ? answers.equipment.filter((x) => x !== k)
                      : [...answers.equipment, k];
                    if (next.length === 0) return;
                    onChange({ ...answers, equipment: next });
                  }}
                >
                  {EQUIPMENT_LABELS[k]}
                </ToggleChip>
              );
            })}
          </fieldset>
        )}
      </Question>
    );
  }
  return (
    <Question
      title="How long per session?"
      note="An estimate, not measured. The review trims to fit if it runs over."
    >
      <fieldset className="min-w-0 border-0 p-0 grid grid-cols-5 gap-2">
        <legend className="sr-only">Minutes per session</legend>
        {MINUTE_OPTIONS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={answers.minutes === m}
            data-testid={`wizard-minutes-${m}`}
            onClick={() => onChange({ ...answers, minutes: m })}
            className={cn(
              "num h-14 rounded-md text-sm font-semibold transition-colors duration-150",
              answers.minutes === m
                ? "bg-accent-soft text-accent-ink"
                : "bg-surface-2 text-ink hover:bg-surface-hover",
            )}
          >
            {m}
          </button>
        ))}
      </fieldset>
      <p className="text-xs text-soft">minutes</p>
    </Question>
  );
}
