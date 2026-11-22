import { cn } from "@/lib/utils";

/**
 * One-control 1..N scale (native range input: role=slider, arrow keys, touch
 * drag). The whole 44px-tall input is the touch target. `value` undefined =
 * not set yet; the thumb parks mid-scale and a plain tap/release on it still
 * records that value.
 */
export function ScaleSlider({
  value,
  onChange,
  min = 1,
  max = 10,
  label,
  testId,
  className,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  testId?: string;
  className?: string;
}) {
  const parked = Math.round((min + max) / 2);
  const commit = (el: HTMLInputElement) => onChange(Number(el.value));
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value ?? parked}
      aria-label={label}
      aria-valuetext={value == null ? "not set" : `${value} of ${max}`}
      data-testid={testId}
      data-set={value != null}
      onChange={(e) => commit(e.currentTarget)}
      onPointerUp={(e) => value == null && commit(e.currentTarget)}
      onKeyUp={(e) => value == null && commit(e.currentTarget)}
      style={{ accentColor: "var(--color-accent-solid)" }}
      className={cn(
        "block h-11 w-full cursor-pointer md:h-8",
        value == null && "opacity-50",
        className,
      )}
    />
  );
}
