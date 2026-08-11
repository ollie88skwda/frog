import type { KeyboardEvent } from "react";
import { InfoTip } from "@/components/lesson";
import { Input } from "@/components/ui/input";
import type { LessonId } from "@/lib/lessons";

// RPE is a fixed 0.5-step scale (1–10), not a free-form number — a small
// select keeps it a quick pick and reads as clearly secondary to weight/reps.
const RPE_OPTIONS = Array.from({ length: 19 }, (_, i) => 10 - i * 0.5);

// Set-modifier registry (M4 UI redesign): RIR/RPE are the only two today, but
// the captain expects at most 1-2 more, ever — not an unbounded plugin system.
// A modifier is a small typed value attached to a set, rendered generically in
// the details sheet; adding one is a config entry here, never new layout JSX.
type ModifierConfig = {
  key: "rir" | "rpe";
  label: string;
  kind: "select" | "range";
  options?: number[];
  infoTipLessonId?: LessonId;
};

const SET_MODIFIERS: ModifierConfig[] = [
  { key: "rir", label: "RIR", kind: "range", infoTipLessonId: "rir" },
  { key: "rpe", label: "RPE", kind: "select", options: RPE_OPTIONS },
];

// A bounded min/max pair, always strings (draft-editable text) — same shape
// as the routine editor's rep-range fields.
type RangeValue = { min: string; max: string };

// A registry entry bound to the state that backs it. Discriminated by `kind`,
// so a modifier's value and its setter can't drift apart in the shape they
// carry — handing a plain string to the range entry is a type error at the
// binding, not a crash on `range.min` at render.
export type ModifierBinding = { config: ModifierConfig } & (
  | { kind: "range"; value: RangeValue; onChange: (v: RangeValue) => void }
  | { kind: "scalar"; value: string; onChange: (v: string) => void }
);

// Every set surface (the logger's details sheet, a committed row's) binds the
// same registry to the same three pieces of state, so the wiring lives here
// once rather than as a duplicated ternary at each call site.
export function modifierBindings(state: {
  rirMin: string;
  rirMax: string;
  rpe: string;
  setRirMin: (v: string) => void;
  setRirMax: (v: string) => void;
  setRpe: (v: string) => void;
}): ModifierBinding[] {
  return SET_MODIFIERS.map((config) =>
    config.kind === "range"
      ? {
          config,
          kind: "range",
          value: { min: state.rirMin, max: state.rirMax },
          onChange: (v: RangeValue) => {
            state.setRirMin(v.min);
            state.setRirMax(v.max);
          },
        }
      : { config, kind: "scalar", value: state.rpe, onChange: state.setRpe },
  );
}

// Shared field renderer for every modifier — the label row reserves a fixed
// height (`min-h-6`) whether or not it carries an InfoTip icon, so RIR and RPE
// (or a future third modifier) always sit flush in the same grid row instead
// of drifting by the icon's height, and the select gets the exact classes as
// the shared Input so its box never looks "elevated" next to a sibling field.
export function ModifierField(
  props: ModifierBinding & {
    onKeyDown?: (e: KeyboardEvent) => void;
    autoFocus?: boolean;
    testId: string;
  },
) {
  const { config, onKeyDown, autoFocus, testId } = props;
  const label = (
    <span className="flex min-h-6 items-center gap-1 text-2xs font-medium tracking-wide text-faint uppercase">
      {config.label}
      {config.infoTipLessonId && <InfoTip lessonId={config.infoTipLessonId} />}
    </span>
  );

  if (props.kind === "range") {
    const range = props.value;
    const onRangeChange = props.onChange;
    return (
      <div className="flex flex-col gap-1">
        {label}
        <div className="flex items-center gap-1">
          <Input
            inputMode="numeric"
            placeholder="—"
            value={range.min}
            onChange={(e) => onRangeChange({ ...range, min: e.target.value })}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            className="num"
            data-testid={`${testId}min`}
          />
          <span className="text-2xs text-faint">–</span>
          <Input
            inputMode="numeric"
            placeholder="—"
            value={range.max}
            onChange={(e) => onRangeChange({ ...range, max: e.target.value })}
            onKeyDown={onKeyDown}
            className="num"
            data-testid={`${testId}max`}
          />
        </div>
      </div>
    );
  }

  const { value, onChange } = props;
  return (
    <div className="flex flex-col gap-1">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        // biome-ignore lint/a11y/noAutofocus: focuses the just-added field
        autoFocus={autoFocus}
        data-testid={testId}
        className="num h-8 w-full border border-border-strong bg-surface px-2 text-sm text-soft transition-colors duration-150 ease-(--ease-out-quad) focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
      >
        <option value="">—</option>
        {config.options?.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}
