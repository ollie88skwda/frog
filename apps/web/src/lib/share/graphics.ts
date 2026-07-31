// Signature-graphic canvas painters (share redesign, report §5.2/§6 step 4):
// the body heat map, the 13-week consistency strip, the 12-month bar strip,
// and the e1RM sparkline. Plain Path2D/lineTo — no chart library, per
// AGENTS.md's "audit every dependency" rule. The heat map draws the exact
// same path geometry as the interactive SVG (components/charts/body-paths.ts)
// so the two never drift.
import type { MuscleRegion } from "@frog/core";
import { regionSetsOf } from "@/components/charts/body-heatmap";
import {
  type BodyView,
  NEUTRAL_PARTS,
  opacityFor,
  PART,
  VIEW_REGIONS,
} from "@/components/charts/body-paths";
import type { Palette } from "./grounds";

type Box = { x: number; y: number; w: number; h: number };

export function paintHeatmap(
  ctx: CanvasRenderingContext2D,
  box: Box,
  palette: Palette,
  muscleSets: Record<string, number>,
) {
  const regionSets = regionSetsOf(muscleSets);
  const max = Math.max(1, ...Object.values(regionSets));
  const boxSide = 168; // matches the interactive SVG's viewBox
  const scale = Math.min(box.w / boxSide, box.h / boxSide);
  const originX = box.x + (box.w - boxSide * scale) / 2;
  const originY = box.y + (box.h - boxSide * scale) / 2;

  const drawFigure = (view: BodyView, xOffset: number) => {
    ctx.save();
    ctx.translate(originX + xOffset * scale, originY + 2 * scale);
    ctx.scale(scale, scale);

    ctx.fillStyle = palette.hair;
    for (const d of NEUTRAL_PARTS) ctx.fill(new Path2D(d));
    const regions = VIEW_REGIONS[view];
    for (const parts of Object.values(regions)) {
      for (const part of parts) ctx.fill(new Path2D(PART[part]));
    }

    for (const [region, parts] of Object.entries(regions) as Array<
      [MuscleRegion, string[]]
    >) {
      const op = opacityFor(regionSets[region], max);
      if (op <= 0) continue;
      ctx.globalAlpha = op;
      ctx.fillStyle = palette.accent;
      for (const part of parts) ctx.fill(new Path2D(PART[part]));
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  drawFigure("front", 2);
  drawFigure("back", 90);
}

/** Oldest → newest, one square per week: filled = that week had ≥1 workout. */
export function paintConsistencyStrip(
  ctx: CanvasRenderingContext2D,
  box: Box,
  palette: Palette,
  weeks: boolean[],
) {
  if (weeks.length === 0) return;
  const gap = box.w * 0.012;
  const cell = Math.min(
    (box.w - gap * (weeks.length - 1)) / weeks.length,
    box.h,
  );
  const totalW = cell * weeks.length + gap * (weeks.length - 1);
  const startX = box.x + (box.w - totalW) / 2;
  const cy = box.y + box.h / 2;
  weeks.forEach((hit, i) => {
    ctx.fillStyle = hit ? palette.accent : palette.hair;
    ctx.fillRect(startX + i * (cell + gap), cy - cell / 2, cell, cell);
  });
}

/** 12 bars, index = month; the most productive month reads full accent, the
 * rest a faint tone — same "one flagged, rest quiet" language as a PR badge. */
export function paintMonthBars(
  ctx: CanvasRenderingContext2D,
  box: Box,
  palette: Palette,
  monthlyWorkouts: number[],
  flaggedMonth: number | null,
) {
  const max = Math.max(1, ...monthlyWorkouts);
  const gap = box.w * 0.01;
  const barW = (box.w - gap * 11) / 12;
  monthlyWorkouts.forEach((n, i) => {
    const h = Math.max(box.h * 0.06, (n / max) * box.h);
    const x = box.x + i * (barW + gap);
    const y = box.y + box.h - h;
    ctx.fillStyle = i === flaggedMonth ? palette.accent : palette.hair;
    ctx.fillRect(x, y, barW, h);
  });
}

/** Month dot-calendar: one dot per day, workout days filled accent. */
export function paintMonthDots(
  ctx: CanvasRenderingContext2D,
  box: Box,
  palette: Palette,
  year: number,
  month: number,
  workoutDays: Set<string>,
) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const cols = 7;
  const rows = Math.ceil((firstDow + daysInMonth) / cols);
  const gap = box.w * 0.015;
  const cell = Math.min(
    (box.w - gap * (cols - 1)) / cols,
    (box.h - gap * (rows - 1)) / rows,
  );
  const gridW = cell * cols + gap * (cols - 1);
  const gridH = cell * rows + gap * (rows - 1);
  const startX = box.x + (box.w - gridW) / 2;
  const startY = box.y + (box.h - gridH) / 2;

  for (let d = 1; d <= daysInMonth; d++) {
    const idx = firstDow + d - 1;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    ctx.fillStyle = workoutDays.has(key) ? palette.accent : palette.hair;
    ctx.fillRect(
      startX + col * (cell + gap),
      startY + row * (cell + gap),
      cell,
      cell,
    );
  }
}

/** e1RM-style trend line; the final point is flagged with a larger accent dot. */
export function paintSparkline(
  ctx: CanvasRenderingContext2D,
  box: Box,
  palette: Palette,
  points: Array<{ at: number; value: number }>,
) {
  if (points.length === 0) return;
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const padY = box.h * 0.15;
  const x = (i: number) =>
    points.length === 1
      ? box.x + box.w / 2
      : box.x + (i / (points.length - 1)) * box.w;
  const y = (v: number) =>
    box.y + padY + (1 - (v - min) / (max - min)) * (box.h - padY * 2);

  ctx.strokeStyle = palette.soft;
  ctx.lineWidth = Math.max(2, box.w * 0.003);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((p, i) => {
    const px = x(i);
    const py = y(p.value);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    ctx.fillStyle = isLast ? palette.accent : palette.soft;
    ctx.beginPath();
    ctx.arc(
      x(i),
      y(p.value),
      isLast ? box.w * 0.012 : box.w * 0.006,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });
}
