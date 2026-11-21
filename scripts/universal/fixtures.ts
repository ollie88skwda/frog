// Synthetic imitations of two real phone layouts the universal importer reads:
// a numbered routine list ("1A" tiles, wrapped names, SETS/REPS chips) scrolled
// across three screenshots, and a "Share" table (index, name, set count,
// weight x reps, RIR badge). Invented exercises and numbers; no real data.
// Rendered at 1170x2532 (3x of 390x844) like a current iPhone screenshot.
//   bun scripts/universal/render-fixtures.ts

export const ROUTINE = {
  name: "Push Pull",
  exercises: [
    { name: "Cable Crossover Fly", sets: 2, reps: 8, repsMax: 12 },
    { name: "Single Arm Cable Pressdown" },
    { name: "Incline Dumbbell Curl (45 Degrees)" },
    { name: "Single Arm Cable Lateral Raise" },
    { name: "Close Grip Lat Pulldown" },
    { name: "Wide Incline Machine Press" },
    { name: "Reverse Cable Fly" },
    { name: "Chest Supported Neutral Grip Machine Row" },
    { name: "Dumbbell Shrug" },
    { name: "Seated Cable Crunch" },
    { name: "Single Arm Cable Front Raise" },
    { name: "Machine Preacher Curl" },
    { name: "Romanian Deadlift" },
    { name: "Leg Extension" },
    { name: "Seated Leg Curl" },
    { name: "Hip Abductor Machine" },
    { name: "Overhead Rope Cable Extension" },
  ],
} as const;

/** Table rows: [name as printed, count, weight, reps, rir]. */
export const TABLE: [string, number, number, number, number][] = [
  ["Cable Crossover Fly", 1, 115, 9, 1],
  ["Single Arm Cable Pressdown", 2, 45, 10, 1],
  ["Incline Dumbbell Curl (45 Deg...", 2, 25, 8, 2],
  ["Single Arm Cable Lateral Raise", 2, 15, 12, 1],
  ["Close Grip Lat Pulldown", 1, 140, 8, 1],
  ["Wide Incline Machine Press", 1, 185, 7, 2],
  ["Reverse Cable Fly", 1, 90, 12, 0],
  ["Chest Supported Neutral Grip Mach...", 1, 210, 6, 1],
  ["Dumbbell Shrug", 1, 80, 12, 1],
  ["Seated Cable Crunch", 1, 100, 10, 1],
];

const FONT = "-apple-system, 'Helvetica Neue', Arial, sans-serif";

function tile(i: number) {
  return `${i}A`;
}

function routineRow(i: number, ex: (typeof ROUTINE.exercises)[number]) {
  const chips =
    "sets" in ex
      ? `<div class="chips"><span>SETS ${ex.sets}</span><span>REPS ${ex.reps}-${ex.repsMax}</span></div>`
      : "";
  return `<div class="r"><div class="t">${tile(i)}<small>⠿</small></div><div class="n">${ex.name}${chips}</div><div class="d">⋮</div></div>`;
}

/** Routine screen scrolled to rows [from, to] (1-based). */
export function routineHtml(from: number, to: number, cutLast = false): string {
  const rows = ROUTINE.exercises
    .map((e, i) => ({ e, i: i + 1 }))
    .filter((x) => x.i >= from && x.i <= to)
    .map((x) => routineRow(x.i, x.e))
    .join("");
  return `<html><body style="margin:0;width:390px;height:844px;background:#fff;color:#0f172a;font-family:${FONT};position:relative;overflow:hidden">
<div style="height:56px"></div>
<div style="height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-weight:700;font-size:17px"><span>←</span><span>${ROUTINE.name}</span><span>⋮</span></div>
<div style="position:absolute;top:100px;bottom:${cutLast ? "40px" : "112px"};left:0;right:0;overflow:hidden">${rows}</div>
<div style="position:absolute;bottom:0;left:0;right:0;height:112px;background:#fff;display:flex;gap:12px;padding:16px 12px"><div style="flex:1;background:#22c55e;border-radius:8px;color:#fff;text-align:center;line-height:48px;font-weight:700">Start</div><div style="flex:1;border:1px solid #cbd5e1;border-radius:8px;text-align:center;line-height:48px;font-weight:700">Schedule</div></div>
<style>.r{display:flex;align-items:flex-start;gap:14px;padding:14px 14px;border-bottom:1px solid #eef2f7}
.t{width:60px;height:60px;background:#f1f5f9;border-radius:8px;font-weight:800;font-size:20px;text-align:center;padding-top:12px;box-sizing:border-box;flex:none}
.t small{display:block;font-size:12px;color:#94a3b8;margin-top:-2px}
.n{flex:1;font-weight:800;font-size:24px;line-height:1.2;padding-right:60px}
.d{position:absolute;right:20px;font-size:26px}
.chips{margin-top:8px}.chips span{font-size:13px;font-weight:600;background:#e5e9f0;color:#475569;border-radius:6px;padding:4px 8px;margin-right:6px}</style></body></html>`;
}

export function tableHtml(): string {
  // Column positions follow the real screen's proportions (x as % of width).
  const rows = TABLE.map(([name, count, w, reps, rir], i) => {
    return `<div class="r"><div class="i">${String(i + 1).padStart(2, "0")}</div><div class="n">${name.replace(/^(.{16,}?) /, "$1<br>")}</div><div class="c">${count}</div><div class="w">${w} Ibs × ${reps}</div><div class="b ${rir === 0 ? "g" : ""}">${rir}</div></div>`;
  }).join("");
  return `<html><body style="margin:0;width:390px;height:844px;background:#fff;color:#0f172a;font-family:${FONT};position:relative;overflow:hidden">
<div style="height:56px"></div>
<div style="height:50px;display:flex;align-items:center;justify-content:space-between;padding:0 12px"><span style="font-size:22px">✕</span><b style="font-size:21px">Share</b><span style="background:#0f172a;color:#fff;border-radius:20px;padding:8px 18px;font-weight:700">Edit</span></div>
<div style="position:absolute;top:104px;bottom:200px;left:20px;right:20px;overflow:hidden;background:#f8fafc">${rows}</div>
<div style="position:absolute;bottom:0;left:0;right:0;height:200px;background:#fff;display:flex;justify-content:space-around;padding-top:36px;font-weight:700;font-size:15px"><span>Copy link</span><span>WhatsApp</span><span>SMS</span><span>X</span></div>
<style>.r{position:relative;height:52px;border-bottom:1px solid #e2e8f0;font-size:16px}
.r>div{position:absolute;top:0;height:52px;display:flex;align-items:center}
.i{left:19px;color:#475569;font-size:15px}.n{left:49px;width:140px;font-weight:600;line-height:1.2;font-size:16px}
.c{left:207px;font-weight:600}.w{left:225px;font-size:14px;font-weight:600;color:#1e293b}
.b{left:308px;top:14px!important;width:30px;height:24px!important;border-radius:5px;background:#cbd5e1;justify-content:center;font-weight:800}.b.g{background:#15803d;color:#fff}</style></body></html>`;
}

export const SHOTS: { id: string; html: string }[] = [
  { id: "routine-1", html: routineHtml(1, 7) },
  { id: "routine-2", html: routineHtml(5, 12) }, // overlaps shot 1 (rows 5-7)
  { id: "routine-3", html: routineHtml(11, 17, true) }, // overlaps shot 2 (rows 11-12)
  { id: "table", html: tableHtml() },
];
