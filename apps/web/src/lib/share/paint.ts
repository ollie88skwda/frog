// The share-card painter — pure canvas, no React (report §6 step 1). Draws
// one of the six ShareCard kinds onto a canvas at a chosen frame + ground.
// Zones stack top→bottom (A brand · B context · C hero · D support ·
// E graphic · F tagline · G identity); each frame declares which it shows.

import type { ShareCard, ShareIdentity, ShareStat } from "@frog/core";
import { APP_NAME, SHARE_DOMAIN, slugifyHandle } from "@frog/core";
import type { Frame, FrameKind } from "./frames";
import { FRAMES } from "./frames";
import {
  paintConsistencyStrip,
  paintHeatmap,
  paintMonthBars,
  paintMonthDots,
  paintSparkline,
} from "./graphics";
import type { Ground, Palette } from "./grounds";
import { paletteFor } from "./grounds";
import { loadFrogMarkImage } from "./mark";

const FONT_SANS = `"Bricolage Grotesque", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
const FONT_MONO = `ui-monospace, "SF Mono", "Berkeley Mono", Menlo, monospace`;
const MARK_SIZE_RATIO = 84 / 1080;

export type PaintOptions = {
  frame: FrameKind;
  ground: Ground;
  card: ShareCard;
  tagline: string;
  accent: string;
  /** Required (and only used) when ground === "photo". */
  photo?: HTMLImageElement | null;
};

export async function paintShareCard(
  canvas: HTMLCanvasElement,
  opts: PaintOptions,
) {
  const frame = FRAMES[opts.frame];
  canvas.width = frame.w;
  canvas.height = frame.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const p = paletteFor(opts.ground, opts.accent);

  ctx.clearRect(0, 0, frame.w, frame.h);
  if (opts.ground === "photo" && opts.photo) {
    drawCoverImage(ctx, opts.photo, frame.w, frame.h);
    drawScrim(ctx, frame.w, frame.h);
  } else if (p.bg) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, frame.w, frame.h);
  }

  // Background is enough for a "the card painted" check — everything below,
  // including the async mark rasterization, can safely take a beat.
  if (typeof document !== "undefined") await document.fonts.ready;

  const shadow = () => {
    if (p.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 2;
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
  };
  shadow();

  const pad = frame.pad;
  let y = pad + frame.safeTop;
  const contentW = frame.w - pad * 2;

  y = await paintBrand(ctx, frame, p, pad, y);
  y = paintContext(ctx, frame, p, pad, contentW, y, opts.card);
  y = paintHero(ctx, frame, p, pad, contentW, y, opts.card);
  y = paintSupport(ctx, frame, p, pad, contentW, y, opts.card);

  const graphicTop = y;
  paintGraphic(
    ctx,
    { x: pad, y: graphicTop, w: contentW, h: frame.graphicH },
    p,
    opts.card,
  );
  y = graphicTop + frame.graphicH;

  paintFooter(ctx, frame, p, pad, contentW, opts.tagline, opts.card.identity);

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

async function paintBrand(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  p: Palette,
  pad: number,
  y: number,
): Promise<number> {
  const markSize = frame.w * MARK_SIZE_RATIO;
  try {
    const mark = await loadFrogMarkImage(p.ink, p.markBody);
    ctx.drawImage(mark, pad, y, markSize, markSize);
  } catch {
    // Rasterizing the mark failed — the wordmark alone still reads fine.
  }
  ctx.fillStyle = p.ink;
  ctx.font = `700 ${Math.round(frame.w * 0.037)}px ${FONT_SANS}`;
  ctx.textBaseline = "middle";
  ctx.fillText(
    APP_NAME.toUpperCase(),
    pad + markSize + frame.w * 0.022,
    y + markSize / 2,
  );
  ctx.textBaseline = "alphabetic";

  const nextY = y + markSize + frame.w * 0.037;
  ctx.strokeStyle = p.hair;
  ctx.lineWidth = Math.max(1.5, frame.w * 0.0019);
  ctx.beginPath();
  ctx.moveTo(pad, nextY);
  ctx.lineTo(frame.w - pad, nextY);
  ctx.stroke();
  return nextY + frame.w * 0.037;
}

function contextFor(card: ShareCard): {
  eyebrow: string;
  title?: string;
  date?: string;
} {
  switch (card.kind) {
    case "session":
      return { eyebrow: card.eyebrow, title: card.title, date: card.date };
    case "pr":
      return {
        eyebrow: card.eyebrow,
        title: `${card.exerciseName} · ${card.prTypeLabel}`,
      };
    case "records":
      return { eyebrow: card.eyebrow, title: card.exerciseName };
    default:
      return { eyebrow: card.eyebrow };
  }
}

function paintContext(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  p: Palette,
  pad: number,
  contentW: number,
  y: number,
  card: ShareCard,
): number {
  const ctxData = contextFor(card);
  let cy = y;

  cy += frame.w * 0.037;
  ctx.fillStyle = p.accent;
  ctx.font = `700 ${Math.round(frame.w * 0.026)}px ${FONT_SANS}`;
  ctx.fillText(ctxData.eyebrow.toUpperCase(), pad, cy);

  if (ctxData.title) {
    cy += frame.titlePx * 0.85;
    ctx.fillStyle = p.ink;
    ctx.font = `700 ${frame.titlePx}px ${FONT_SANS}`;
    ctx.fillText(clip(ctx, ctxData.title, contentW), pad, cy);
  }

  if (ctxData.date) {
    cy += frame.w * 0.033;
    ctx.fillStyle = p.soft;
    ctx.font = `500 ${Math.round(frame.w * 0.026)}px ${FONT_SANS}`;
    ctx.fillText(ctxData.date, pad, cy);
  }

  return cy + frame.w * 0.05;
}

function paintHero(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  p: Palette,
  pad: number,
  contentW: number,
  y: number,
  card: ShareCard,
): number {
  const hero = card.hero;
  let cy = y;

  if (hero.caption) {
    cy += frame.w * 0.024;
    ctx.fillStyle = p.faint;
    ctx.font = `600 ${Math.round(frame.w * 0.022)}px ${FONT_MONO}`;
    ctx.fillText(clip(ctx, hero.caption.toUpperCase(), contentW), pad, cy);
    cy += frame.heroPx * 0.15;
  }

  cy += frame.heroPx * 0.78;
  ctx.fillStyle = p.ink;
  ctx.font = `800 ${frame.heroPx}px ${FONT_SANS}`;
  ctx.fillText(clip(ctx, hero.value, contentW), pad, cy);
  const valueW = ctx.measureText(hero.value).width;

  if (hero.unit) {
    ctx.fillStyle = p.soft;
    ctx.font = `600 ${frame.unitPx}px ${FONT_SANS}`;
    ctx.fillText(hero.unit, pad + valueW + frame.w * 0.018, cy);
  }

  return cy + frame.heroPx * 0.3;
}

function supportStatsFor(card: ShareCard): ShareStat[] {
  switch (card.kind) {
    case "session":
    case "streak":
    case "month":
    case "year":
    case "measurement":
      return card.support;
    case "pr":
      if (card.extraPrs.length > 0) {
        const base = card.delta ? [card.delta] : [];
        return [
          ...base,
          ...card.extraPrs
            .slice(0, 3 - base.length)
            .map((line) => ({ label: "Also this session", value: line })),
        ];
      }
      return [card.delta, card.previousBest, card.estOneRm].filter(
        (s): s is ShareStat => s != null,
      );
    case "records":
      return card.support;
  }
}

function paintSupport(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  p: Palette,
  pad: number,
  contentW: number,
  y: number,
  card: ShareCard,
): number {
  const stats = supportStatsFor(card);
  if (stats.length === 0) return y;

  const colW = contentW / stats.length;
  const labelSize = Math.round(frame.w * 0.023);
  const valueSize = Math.round(frame.w * 0.048);
  const labelY = y + frame.w * 0.02;
  const valueY = labelY + valueSize * 0.95;

  stats.forEach((s, i) => {
    const x = pad + i * colW;
    if (i > 0) {
      ctx.strokeStyle = p.hair;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - frame.w * 0.018, labelY - labelSize);
      ctx.lineTo(x - frame.w * 0.018, valueY + frame.w * 0.006);
      ctx.stroke();
    }
    ctx.fillStyle = p.faint;
    ctx.font = `600 ${labelSize}px ${FONT_SANS}`;
    ctx.fillText(s.label.toUpperCase(), x, labelY);
    ctx.fillStyle = p.ink;
    ctx.font = `700 ${valueSize}px ${FONT_MONO}`;
    ctx.fillText(clip(ctx, s.value, colW - frame.w * 0.02), x, valueY);
  });

  return valueY + frame.w * 0.06;
}

function paintGraphic(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  p: Palette,
  card: ShareCard,
) {
  switch (card.kind) {
    case "session":
      paintHeatmap(ctx, box, p, card.muscleSets);
      return;
    case "pr":
    case "records":
    case "measurement":
      paintSparkline(ctx, box, p, card.sparkline);
      return;
    case "streak":
      paintConsistencyStrip(ctx, box, p, card.weeks);
      return;
    case "year":
      paintMonthBars(
        ctx,
        box,
        p,
        card.monthlyWorkouts,
        card.mostProductiveMonth,
      );
      return;
    case "month":
      paintMonthDots(
        ctx,
        box,
        p,
        card.year,
        card.month,
        new Set(card.workoutDays),
      );
  }
}

function identityLine(identity: ShareIdentity): {
  left: string;
  right: string;
} {
  const handle = identity.displayName
    ? `@${slugifyHandle(identity.displayName)}`
    : null;
  return {
    left: handle ?? `Tracked with ${APP_NAME}`,
    right: SHARE_DOMAIN ?? "",
  };
}

function paintFooter(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  p: Palette,
  pad: number,
  contentW: number,
  tagline: string,
  identity: ShareIdentity,
) {
  const identityH = frame.w * 0.028 + frame.w * 0.05;
  const taglineH = frame.showTagline ? frame.w * 0.07 : 0;
  let y = frame.h - frame.safeBottom - pad - identityH - taglineH;

  if (frame.showTagline) {
    y += frame.w * 0.03;
    ctx.fillStyle = p.soft;
    ctx.font = `italic 500 ${Math.round(frame.w * 0.028)}px ${FONT_SANS}`;
    ctx.fillText(clip(ctx, tagline, contentW), pad, y);
    y += frame.w * 0.045;
  }

  ctx.strokeStyle = p.hair;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(frame.w - pad, y);
  ctx.stroke();
  y += frame.w * 0.038;

  const { left, right } = identityLine(identity);
  ctx.fillStyle = p.faint;
  ctx.font = `500 ${Math.round(frame.w * 0.024)}px ${FONT_MONO}`;
  ctx.fillText(left, pad, y);
  if (right) {
    const w = ctx.measureText(right).width;
    ctx.fillText(right, frame.w - pad - w, y);
  }
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
}

function drawScrim(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, h * 0.45, 0, h);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(1, "rgba(16,18,17,0.88)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, h * 0.45, w, h * 0.55);
}

// Truncate with an ellipsis to fit `maxW`.
function clip(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW)
    t = t.slice(0, -1);
  return `${t}…`;
}

const OG_TAGLINE = "A training lab notebook.";

/**
 * Static brand OG image (report §4 / §6 step 7) — 1200×630, Green ground, no
 * per-route stats. Frog is a client-rendered SPA with no public read path for
 * a session, so a link unfurl can only ever carry the brand, never a real
 * user's data. Used only by scripts/gen-og-image.ts at build time — not a
 * user-selectable frame (FRAME_ORDER excludes "og").
 */
export async function paintBrandOg(canvas: HTMLCanvasElement) {
  const frame = FRAMES.og;
  canvas.width = frame.w;
  canvas.height = frame.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const p = paletteFor("green", "#131426");

  ctx.fillStyle = p.bg as string;
  ctx.fillRect(0, 0, frame.w, frame.h);
  if (typeof document !== "undefined") await document.fonts.ready;

  const pad = frame.pad;
  const colW = frame.w * 0.52;
  const markSize = frame.h * 0.16;
  let y = pad;

  try {
    const mark = await loadFrogMarkImage(p.ink, p.markBody);
    ctx.drawImage(mark, pad, y, markSize, markSize);
  } catch {
    // Wordmark alone still reads fine.
  }
  ctx.fillStyle = p.ink;
  ctx.font = `700 ${Math.round(frame.h * 0.07)}px ${FONT_SANS}`;
  ctx.textBaseline = "middle";
  ctx.fillText(
    APP_NAME.toUpperCase(),
    pad + markSize + frame.w * 0.018,
    y + markSize / 2,
  );
  ctx.textBaseline = "alphabetic";

  y = frame.h * 0.5;
  ctx.fillStyle = p.soft;
  ctx.font = `600 ${Math.round(frame.h * 0.055)}px ${FONT_SANS}`;
  ctx.fillText(clip(ctx, OG_TAGLINE, colW - pad), pad, y);

  y = frame.h - pad - frame.h * 0.08;
  ctx.strokeStyle = p.hair;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(pad + colW - pad, y);
  ctx.stroke();
  y += frame.h * 0.06;
  ctx.fillStyle = p.faint;
  ctx.font = `500 ${Math.round(frame.h * 0.035)}px ${FONT_MONO}`;
  ctx.fillText(SHARE_DOMAIN ?? `Tracked with ${APP_NAME}`, pad, y);

  // Right column: the mark, large, centred — the one shape people recognise.
  const bigSize = frame.h * 0.62;
  try {
    const mark = await loadFrogMarkImage(p.ink, p.markBody);
    ctx.drawImage(
      mark,
      colW + (frame.w - colW - bigSize) / 2,
      (frame.h - bigSize) / 2,
      bigSize,
      bigSize,
    );
  } catch {
    // Left column already carries the wordmark.
  }
}
