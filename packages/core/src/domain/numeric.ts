// Numeric-only text entry for weight / reps / RIR style fields. One sanitizer
// so typing and pasting behave identically everywhere: it keeps digits (and,
// when decimals are allowed, a single decimal point) and drops everything else.

export type NumericOpts = {
  /** Allow one decimal point (weights, distances). Reps and RIR are integers. */
  decimal?: boolean;
  /** Max digits after the point; extra digits are dropped. Default 2. */
  maxDecimals?: number;
};

/**
 * Cleans raw text from an input's onChange (typed or pasted). Digits only,
 * plus at most one "." when `decimal` is set. A "," counts as the decimal
 * point when no "." exists yet (comma keypads). Signs, letters, spaces and
 * every other character are removed.
 */
export function sanitizeNumeric(raw: string, opts: NumericOpts = {}): string {
  if (!opts.decimal) return raw.replace(/\D/g, "");
  const maxDecimals = opts.maxDecimals ?? 2;
  const text = raw.includes(".") ? raw : raw.replace(",", ".");
  const cleaned = text.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const whole = cleaned.slice(0, dot);
  const frac = cleaned
    .slice(dot + 1)
    .replace(/\./g, "")
    .slice(0, maxDecimals);
  return `${whole}.${frac}`;
}

/** The `inputMode` a numeric field should ask the mobile keyboard for. */
export function numericInputMode(decimal: boolean): "decimal" | "numeric" {
  return decimal ? "decimal" : "numeric";
}
