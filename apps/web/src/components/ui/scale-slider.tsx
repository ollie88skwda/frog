import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * One-control 1..N scale (native range input: role=slider, arrow keys, touch
 * drag). The whole 44px-tall input is the touch target. `value` undefined =
 * not set yet; the thumb parks mid-scale and a tap that starts on it, or a
 * value-picking key, still records that value.
 */
const PICK_KEYS = new Set([
  "Enter",
  " ",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

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
  const pressed = useRef(false);
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
      onPointerDown={() => {
        pressed.current = true;
      }}
      onPointerUp={(e) => {
        if (pressed.current && value == null) commit(e.currentTarget);
        pressed.current = false;
      }}
      onPointerCancel={() => {
        pressed.current = false;
      }}
      onPointerLeave={() => {
        pressed.current = false;
      }}
      onKeyDown={(e) => {
        if (value == null && PICK_KEYS.has(e.key)) commit(e.currentTarget);
      }}
      style={{ accentColor: "var(--color-accent-solid)" }}
      className={cn(
        "block h-11 w-full cursor-pointer md:h-8",
        value == null && "opacity-50",
        className,
      )}
    />
  );
}
