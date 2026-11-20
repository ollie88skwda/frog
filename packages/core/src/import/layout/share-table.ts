// Layout parser: a "Share" / workout-summary table. One row per exercise:
// "01  Pec Deck/Machine Fly   1   295 lbs x 7   [1]" = index, name (wraps to
// two lines, long ones end in "..."), set count (this app writes 2 for a
// unilateral exercise), one weight x reps, and a coloured badge holding a
// small number (read as RIR). Whole-page OCR misreads or drops digits on the
// tiny weight and badge cells, so every cell is re-read on a clean binarised
// upscale at several scales and the readings vote.
import { linesFromWords, median, readRegion, vote } from "./scan";
import type { PageScan, PageWord } from "./types";

export type TableRow = {
  index: number;
  indexRaw: string;
  name: string;
  nameConf: number;
  /** Name ended in "..." (the app shortened it); may be completed elsewhere. */
  truncated: boolean;
  count: number | null;
  weight: number | null;
  reps: number | null;
  unit: "lb" | "kg" | null;
  badge: number | null;
  /** 0..1 how many independent readings agreed on weight x reps. */
  setAgreement: number;
  /** Plain-language reasons this row needs a look. */
  flags: string[];
  raw: string;
  partial: boolean;
};

export type ShareTableScan = { title: string | null; rows: TableRow[] };

// l, I, | and 1 are all "l" to OCR; a weight is digits then l-like + "bs".
// OCR reads the "l" of "lbs" as l, I, | or 1, and glues it to the number
// ("351bs" is 35 + "1bs"). With a space before the unit the digits are exact;
// glued, take the fewest digits that leave a valid unit.
const L = "[Il|1\\]\\[!]";
const SET_SPACED = new RegExp(
  `^(\\d{1,4}(?:[.,]\\d)?)\\s+${L}{1,2}b[s5$]\\s*[x×*]\\s*(\\d{1,3})$`,
  "i",
);
const SET_GLUED = new RegExp(
  `^(\\d{1,4}?(?:[.,]\\d)?)${L}{1,2}b[s5$]\\s*[x×*]\\s*(\\d{1,3})$`,
  "i",
);
const SET_KG = /^(\d{1,4}(?:[.,]\d)?)\s*(?:kgs?|kilos?)\s*[x×*]\s*(\d{1,3})$/i;

export function parseWeightReps(
  text: string,
): { weight: number; reps: number; unit: "lb" | "kg" } | null {
  const t = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:;]+$/, "");
  const kg = SET_KG.exec(t);
  if (kg)
    return {
      weight: Number.parseFloat(kg[1].replace(",", ".")),
      reps: Number(kg[2]),
      unit: "kg",
    };
  const m = SET_SPACED.exec(t) ?? SET_GLUED.exec(t);
  if (!m) return null;
  return {
    weight: Number.parseFloat(m[1].replace(",", ".")),
    reps: Number(m[2]),
    unit: "lb",
  };
}

export async function parseShareTable(
  scan: PageScan,
): Promise<ShareTableScan | null> {
  const { width: W, height: H } = scan;
  const words = scan.lines.flatMap((l) => l.words);
  const top = 0.1 * H;
  const cand = words.filter(
    (w) =>
      w.box.x1 < 0.2 * W &&
      w.box.y0 > top &&
      w.box.y1 < 0.84 * H &&
      /^[0-9a-z]{2}$/i.test(w.text) &&
      // the index sits in one narrow column
      w.box.y1 - w.box.y0 < 0.05 * H,
  );
  const colX = median(cand.map((w) => w.box.x0));
  const idx = cand
    .filter((w) => Math.abs(w.box.x0 - colX) < 0.03 * W)
    .sort((a, b) => a.box.y0 - b.box.y0);
  if (idx.length < 3) return null;
  const read = idx.map((w) => {
    const t = w.text.replace(/^o/i, "0");
    return /^\d\d$/.test(t) ? Number(t) : null;
  });
  // Rows are numbered 1,2,3...: repair a misread index ("os") from the run.
  const offs = new Map<number, number>();
  read.forEach((r, i) => {
    if (r != null) offs.set(r - i, (offs.get(r - i) ?? 0) + 1);
  });
  const best = [...offs.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 3) return null;
  const nums = idx.map((_, i) => best[0] + i);
  const cy = idx.map((w) => (w.box.y0 + w.box.y1) / 2);
  const pitch = median(cy.slice(1).map((c, i) => c - cy[i]));
  // Index tiles sit at the vertical centre of their row's text block.
  const tableBottom = Math.min(
    0.81 * H,
    ...scan.lines
      .filter((l) => /^(copy|whatsapp|sms|share to|more)/i.test(l.text))
      .map((l) => l.box.y0 - 0.02 * H),
  );
  // A tile whose digits were misread ("11" as a quote mark) still has its
  // row: extend the run by the row pitch while name text sits in the band.
  const idxWords = [...idx];
  for (;;) {
    const next = cy[cy.length - 1] + pitch;
    const hasText = words.some((w) => {
      const c = (w.box.y0 + w.box.y1) / 2;
      return (
        c > next - pitch * 0.45 &&
        c < next + pitch * 0.45 &&
        w.box.x0 > 0.2 * W &&
        w.box.x0 < 0.5 * W
      );
    });
    if (next - pitch * 0.2 > tableBottom || !hasText) break;
    cy.push(next);
    nums.push(nums[nums.length - 1] + 1);
    idxWords.push({
      text: String(nums[nums.length - 1]),
      conf: 0,
      box: { x0: 0, y0: next, x1: 0, y1: next },
    });
  }
  const nameLeft = Math.max(...idx.map((w) => w.box.x1)) + 0.02 * W;
  const nameRight = 0.55 * W;
  const rows: TableRow[] = [];
  for (let i = 0; i < cy.length; i++) {
    const start = i === 0 ? cy[0] - pitch * 0.5 : (cy[i - 1] + cy[i]) / 2;
    const end =
      i === cy.length - 1 ? cy[i] + pitch * 0.5 : (cy[i] + cy[i + 1]) / 2;
    const cutOff = end > tableBottom;
    const nameWords: PageWord[] = words.filter((w) => {
      const c = (w.box.y0 + w.box.y1) / 2;
      return (
        c >= start &&
        c < end &&
        c < tableBottom &&
        w.box.x0 >= nameLeft &&
        w.box.x1 <= nameRight + 0.05 * W &&
        w.box.x0 < nameRight
      );
    });
    // The page pass reads the name fine; the set cell on the same line is
    // cut away by x so "Cable Extension 2 65lbsx8" never leaks into it.
    const name = linesFromWords(nameWords)
      .map((l) => l.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/[|~:*]+$/g, "")
      .trim();
    const truncated = /(\.{2,}|…)$/.test(name);
    const rowRect = (x0: number, x1: number) => ({
      x0: x0 * W,
      x1: x1 * W,
      y0: Math.max(start, cy[i] - pitch * 0.5),
      y1: Math.min(end, cy[i] + pitch * 0.5),
    });
    // weight x reps: several scales, with and without hard thresholding
    const setReads: { value: string; conf: number }[] = [];
    const rawReads: string[] = [];
    if (!cutOff) {
      for (const scale of [3, 4, 5, 6])
        for (const binarize of [true, false]) {
          const r = await readRegion(scan, rowRect(0.62, 0.81), "line", {
            scale,
            binarize,
            pad: 30,
          });
          const t = r[0]?.text;
          if (!t) continue;
          rawReads.push(t);
          const p = parseWeightReps(t);
          if (p)
            setReads.push({
              value: `${p.weight}|${p.reps}|${p.unit}`,
              conf: r[0].conf,
            });
        }
    }
    const sv = voteDroppedDigits(setReads);
    let weight: number | null = null;
    let reps: number | null = null;
    let unit: "lb" | "kg" | null = null;
    if (sv)
      [weight, reps, unit] = sv.value
        .split("|")
        .map((v, k) => (k === 0 ? Number(v) : k === 1 ? Number(v) : v)) as [
        number,
        number,
        "lb" | "kg",
      ];
    // count + badge: single digit each, voted
    const digit = async (x0: number, x1: number) => {
      const got: { value: number; conf: number }[] = [];
      if (cutOff) return null;
      // Light-on-dark chips and dark-on-light cells both appear, so read each
      // polarity and let the readings vote; a blank read just abstains.
      for (const scale of [3, 4])
        for (const binarize of [true, false])
          for (const invert of [false, true]) {
            const r = await readRegion(scan, rowRect(x0, x1), "digit", {
              scale,
              binarize,
              invert,
              pad: 30,
            });
            const n = r[0]
              ? /^\d$/.exec(r[0].text.replace(/\s/g, ""))?.[0]
              : null;
            if (n != null && r[0].conf > 0.25)
              got.push({ value: Number(n), conf: r[0].conf });
          }
      return vote(got);
    };
    const c = await digit(0.565, 0.625);
    const b = await digit(0.84, 0.91);
    const flags: string[] = [];
    if (cutOff) flags.push("Row is cut off at the bottom of the screenshot");
    if (truncated) flags.push("Name was shortened by the app");
    if (!sv && !cutOff) flags.push("Could not read weight and reps");
    else if (sv && sv.agree < 0.6)
      flags.push("Weight or reps read inconsistently");
    if (c == null && !cutOff) flags.push("Set count unreadable");
    if (b == null && !cutOff) flags.push("RIR badge unreadable");
    rows.push({
      index: nums[i],
      indexRaw: idxWords[i].text,
      name,
      nameConf: nameWords.length
        ? nameWords.reduce((m, w) => m + w.conf, 0) / nameWords.length / 100
        : 0,
      truncated,
      count: c?.value ?? null,
      weight,
      reps,
      unit,
      badge: b?.value ?? null,
      setAgreement: sv ? sv.agree * Math.min(1, sv.conf + 0.15) : 0,
      flags,
      raw: `${nums[i]} ${name} | ${rawReads[0] ?? ""}`,
      partial: cutOff,
    });
  }
  const title = scan.lines.find(
    (l) => l.box.y0 < top + 0.05 * H && /share/i.test(l.text),
  );
  const good = rows.filter((r) => r.name);
  // A real share table has readable weight x reps cells; anything else is some other list.
  if (good.filter((r) => r.weight != null).length < 2) return null;
  return { title: title ? "Share" : null, rows: good };
}

/**
 * Vote on "weight|reps|unit" readings. OCR drops digits ("115" -> "15") far
 * more often than it invents them, so a reading that is a digit-dropped copy
 * of a longer one counts for the longer one.
 */
export function voteDroppedDigits(
  reads: { value: string; conf: number }[],
): { value: string; agree: number; conf: number } | null {
  const parts = reads.map((r) => ({ ...r, p: r.value.split("|") }));
  const folded = parts.map((r) => {
    const longer = parts.find(
      (o) =>
        o.p[1] === r.p[1] &&
        o.p[0].length > r.p[0].length &&
        o.p[0].includes(r.p[0]),
    );
    return { value: longer ? longer.value : r.value, conf: r.conf };
  });
  return vote(folded);
}
