// Forgiving date/time reader for text and CSV imports. Returns a local-time ms
// epoch (no Date.parse, so no engine/locale surprises) plus how much of it was
// actually present, so callers can lower confidence for guessed parts.

export type LooseDate = {
  ms: number;
  hasTime: boolean;
  hasYear: boolean;
  /** Numeric d/m/y with both parts <= 12 and no hint: order was assumed. */
  ambiguous: boolean;
};

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const MONTH_IDX: Record<string, number> = Object.fromEntries(
  MONTHS.split("|").map((m, i) => [m, i]),
);
/** A real month spelling ("Nov", "Nov.", "November"), never "Decline". */
export const MONTH_WORD =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b\\.?";
const TIME_RE = /(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?\s*(am|pm)?/i;
const DAY_MONTH_RE = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_WORD}),?(?:\\s+(\\d{4}))?`,
  "i",
);
const MONTH_DAY_RE = new RegExp(
  `\\b(${MONTH_WORD})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?(?:\\s+(\\d{4}))?`,
  "i",
);
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const NUMERIC_RE = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})\b/;

function readTime(s: string): { h: number; m: number } | null {
  const t = TIME_RE.exec(s);
  if (!t) return null;
  let h = Number(t[1]);
  const m = Number(t[2]);
  const ap = t[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return { h, m };
}

function valid(y: number, mo: number, d: number): boolean {
  const dt = new Date(y, mo, d);
  return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d;
}

/**
 * `order` resolves all-numeric dates: "dmy" | "mdy" (default: unambiguous
 * part wins, else month-first and `ambiguous: true`). A missing year means
 * "the most recent such day": this year, or last year if that is in the future.
 */
export function parseLooseDate(
  raw: string,
  opts: { now?: number; order?: "dmy" | "mdy" } = {},
): LooseDate | null {
  const now = new Date(opts.now ?? Date.now());
  const s = raw.trim();
  if (!s || s.length > 80) return null;
  let y: number | null = null;
  let mo: number;
  let d: number;
  let ambiguous = false;

  const iso = ISO_RE.exec(s);
  const dm = DAY_MONTH_RE.exec(s);
  const md = MONTH_DAY_RE.exec(s);
  const num = NUMERIC_RE.exec(s);
  if (iso) {
    y = Number(iso[1]);
    mo = Number(iso[2]) - 1;
    d = Number(iso[3]);
  } else if (dm) {
    d = Number(dm[1]);
    mo = MONTH_IDX[dm[2].slice(0, 3).toLowerCase()];
    y = dm[3] ? Number(dm[3]) : null;
  } else if (md) {
    mo = MONTH_IDX[md[1].slice(0, 3).toLowerCase()];
    d = Number(md[2]);
    y = md[3] ? Number(md[3]) : null;
  } else if (num) {
    const a = Number(num[1]);
    const b = Number(num[2]);
    y = Number(num[3]);
    if (y < 100) y += 2000;
    let dmy: boolean;
    if (opts.order) dmy = opts.order === "dmy";
    else if (a > 12) dmy = true;
    else if (b > 12) dmy = false;
    else {
      dmy = false;
      ambiguous = a !== b;
    }
    d = dmy ? a : b;
    mo = (dmy ? b : a) - 1;
  } else {
    return null;
  }

  const hasYear = y !== null;
  if (y === null) {
    y = now.getFullYear();
    if (valid(y, mo, d) && new Date(y, mo, d, 0, 0).getTime() > now.getTime())
      y -= 1;
  }
  if (!valid(y, mo, d)) return null;
  const t = readTime(s);
  return {
    ms: new Date(y, mo, d, t?.h ?? 12, t?.m ?? 0).getTime(),
    hasTime: t !== null,
    hasYear,
    ambiguous,
  };
}
