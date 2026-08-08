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
import { drawFrogMark, loadFrogMarkImage } from "./mark";
import { type MascotPose, paintMascotMoment } from "./mascot";

const FONT_SANS = `"Bricolage Grotesque", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
const FONT_MONO = `ui-monospace, "SF Mono", "Berkeley Mono", Menlo, monospace`;
const MARK_SIZE_RATIO = 84 / 1080;
/** Breathing room (× frame width) between the graphic and the footer above
 * which it must never encroach. */
const GRAPHIC_GAP_RATIO = 0.03;
/** Below this height (× frame width) a heat map / strip / sparkline is a
 * smear rather than a graphic — drop it instead of squashing it. */
const MIN_GRAPHIC_RATIO = 0.055;

/** The frame's compact-mode spacing multiplier (frames.ts) — every
 * w-ratio margin the painter uses passes through this so the landscape
 * frame's 0.6 can fit a 608-tall poster without touching the other frames. */
function sp(frame: Frame, r: number): number {
  return r * (frame.spacing ?? 1);
}

/** The frog-mascot pose for a card kind: the PR moment (bar overhead) for
 * achievement kinds, the ride everywhere else. */
function poseFor(card: ShareCard): MascotPose {
  return card.kind === "pr" || card.kind === "records" ? "press" : "ride";
}

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
  // Throw rather than return quietly: a caller that exported the untouched
  // canvas anyway would hand the user a fully transparent PNG.
  if (!ctx) throw new Error("2D canvas context unavailable");
  // The Photo ground paints no background of its own (palette `bg: null`), so
  // without a photo it would leave the card fully transparent and its white
  // ink invisible. Dark is the readable stand-in until one is picked.
  const ground: Ground =
    opts.ground === "photo" && !opts.photo ? "dark" : opts.ground;
  const p = paletteFor(ground, opts.accent);

  ctx.clearRect(0, 0, frame.w, frame.h);
  if (ground === "photo" && opts.photo) {
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
  const pose = poseFor(opts.card);

  y = await paintBrand(ctx, frame, p, pad, y, pose);
  const footerY = footerTop(frame, pad);

  if (frame.layout === "split") {
    // The landscape poster: brand row full-width, then a 55/45 split — left
    // column context + hero, right column the signature graphic on top with
    // the support row bottom-anchored beneath it (table-under-figure; the
    // graphic is the widest any frame gives it). Everything below is the same
    // painters as the stack path, just with narrowed content boxes.
    const splitX = pad + contentW * (frame.splitRatio ?? 0.55);
    const leftW = splitX - pad;
    const rightW = frame.w - pad - splitX;
    const colTop = y;
    const contextEnd = paintContext(
      ctx,
      frame,
      p,
      pad,
      leftW,
      colTop,
      opts.card,
    );
    paintHero(ctx, frame, p, pad, leftW, contextEnd, opts.card);
    // Support row height is deterministic (same advance math as paintSupport)
    // — anchor it to the footer so the graphic above it gets the whole column
    // instead of being squeezed by a top-anchored row.
    const supportTop = footerY - supportRowHeight(frame, opts.card);
    const graphicH = Math.min(
      frame.graphicH,
      supportTop - frame.w * GRAPHIC_GAP_RATIO - colTop,
    );
    if (graphicH >= frame.w * MIN_GRAPHIC_RATIO) {
      paintGraphic(
        ctx,
        { x: splitX, y: colTop, w: rightW, h: graphicH },
        p,
        opts.card,
      );
    }
    paintSupport(ctx, frame, p, splitX, rightW, supportTop, opts.card);
  } else {
    y = paintContext(ctx, frame, p, pad, contentW, y, opts.card);
    y = paintHero(ctx, frame, p, pad, contentW, y, opts.card);
    y = paintSupport(ctx, frame, p, pad, contentW, y, opts.card);

    // The graphic is the one zone that can be squeezed: everything above it
    // is text whose height depends on the card kind (a session card carries
    // an eyebrow + title + date + hero caption, a streak card only an
    // eyebrow), and the footer is anchored to the bottom. Size it against the
    // space actually left rather than the frame's nominal height, or long
    // kinds paint their figures straight through the tagline and the identity
    // hairline.
    const graphicTop = y;
    const graphicH = Math.min(
      frame.graphicH,
      footerY - frame.w * GRAPHIC_GAP_RATIO - graphicTop,
    );
    if (graphicH >= frame.w * MIN_GRAPHIC_RATIO) {
      paintGraphic(
        ctx,
        { x: pad, y: graphicTop, w: contentW, h: graphicH },
        p,
        opts.card,
      );
    }
  }

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
  pose: MascotPose,
): Promise<number> {
  const markSize = frame.w * (frame.markRatio ?? MARK_SIZE_RATIO);
  try {
    const mark = await loadFrogMarkImage(p.ink, p.markBody);
    drawFrogMark(ctx, mark, pad, y, markSize);
  } catch {
    // Rasterizing the mark failed — the wordmark alone still reads fine.
  }
  ctx.fillStyle = p.ink;
  ctx.font = `700 ${Math.round(sp(frame, 0.037) * frame.w)}px ${FONT_SANS}`;
  ctx.textBaseline = "middle";
  ctx.fillText(
    APP_NAME.toUpperCase(),
    pad + markSize + sp(frame, 0.022) * frame.w,
    y + markSize / 2,
  );
  ctx.textBaseline = "alphabetic";

  const nextY = y + markSize + sp(frame, 0.037) * frame.w;
  ctx.strokeStyle = p.hair;
  ctx.lineWidth = Math.max(1.5, frame.w * 0.0019);
  ctx.beginPath();
  ctx.moveTo(pad, nextY);
  ctx.lineTo(frame.w - pad, nextY);
  ctx.stroke();

  // The frog-mascot moment, top-right of the brand row — the one place on
  // every frame with guaranteed empty space (content is left-anchored; the
  // mascot never touches a data zone). Sized off the mark and vertically
  // centred on the row; the box is wide enough for the landscape mark.
  const mascotH = markSize * 1.45;
  await paintMascotMoment(
    ctx,
    {
      x: frame.w - pad - mascotH * 2.1,
      y: y + markSize / 2 - mascotH / 2,
      w: mascotH * 2.1,
      h: mascotH,
    },
    p,
    pose,
  );

  return nextY + sp(frame, 0.037) * frame.w;
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

  cy += sp(frame, 0.037) * frame.w;
  ctx.fillStyle = p.accent;
  ctx.font = `700 ${Math.round(sp(frame, 0.026) * frame.w)}px ${FONT_SANS}`;
  ctx.fillText(ctxData.eyebrow.toUpperCase(), pad, cy);

  if (ctxData.title) {
    cy += frame.titlePx * 0.85;
    ctx.fillStyle = p.ink;
    ctx.font = `700 ${frame.titlePx}px ${FONT_SANS}`;
    ctx.fillText(clip(ctx, ctxData.title, contentW), pad, cy);
  }

  // "poster" frames (landscape) skip the date and the conditions strip —
  // their 608px budget has no room for either (report §2.2); the story/post/
  // square frames carry the full lab-report context.
  const poster = frame.contextMode === "poster";
  if (ctxData.date && !poster) {
    cy += sp(frame, 0.033) * frame.w;
    ctx.fillStyle = p.soft;
    ctx.font = `500 ${Math.round(sp(frame, 0.026) * frame.w)}px ${FONT_SANS}`;
    ctx.fillText(ctxData.date, pad, cy);
  }

  // The lab-report conditions strip — session cards only, and only when the
  // session actually recorded conditions (builders set conditionsLine to null
  // otherwise; the card never invents one). Same mono data-row voice as the
  // support stats, formatted by the same helper as the in-session chip
  // (lib/share/conditions.ts).
  if (!poster && card.kind === "session" && card.conditionsLine) {
    cy += sp(frame, 0.024) * frame.w;
    ctx.fillStyle = p.faint;
    ctx.font = `600 ${Math.round(sp(frame, 0.022) * frame.w)}px ${FONT_MONO}`;
    ctx.fillText(clip(ctx, card.conditionsLine, contentW), pad, cy);
  }

  return cy + sp(frame, 0.05) * frame.w;
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
    cy += sp(frame, 0.024) * frame.w;
    ctx.fillStyle = p.faint;
    ctx.font = `600 ${Math.round(sp(frame, 0.022) * frame.w)}px ${FONT_MONO}`;
    ctx.fillText(clip(ctx, hero.caption.toUpperCase(), contentW), pad, cy);
    cy += frame.heroPx * 0.15;
  }

  // The unit sits after the value on the same line, so it needs its own slot
  // reserved before the value is clipped — and the value must then be measured
  // as clipped. Measuring the raw string would park the unit off the card
  // whenever the value was long enough to need truncating.
  const unitFont = `600 ${frame.unitPx}px ${FONT_SANS}`;
  const unitGap = sp(frame, 0.018) * frame.w;
  let unitW = 0;
  if (hero.unit) {
    ctx.font = unitFont;
    unitW = ctx.measureText(hero.unit).width + unitGap;
  }

  cy += frame.heroPx * 0.78;
  ctx.fillStyle = p.ink;
  ctx.font = `800 ${frame.heroPx}px ${FONT_SANS}`;
  const value = clip(ctx, hero.value, contentW - unitW);
  ctx.fillText(value, pad, cy);
  const valueW = ctx.measureText(value).width;

  if (hero.unit) {
    ctx.fillStyle = p.soft;
    ctx.font = unitFont;
    ctx.fillText(hero.unit, pad + valueW + unitGap, cy);
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

/** Height of the support-stats row (0 when the card has none) — the advance
 * math paintSupport uses, exposed so the split layout can bottom-anchor the
 * row and give the graphic the column above it. */
function supportRowHeight(frame: Frame, card: ShareCard): number {
  const stats = supportStatsFor(card);
  if (stats.length === 0) return 0;
  const valueSize = Math.round(sp(frame, 0.048) * frame.w);
  const labelY = sp(frame, 0.02) * frame.w;
  return labelY + valueSize * 0.95 + sp(frame, 0.06) * frame.w;
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
  const labelSize = Math.round(sp(frame, 0.023) * frame.w);
  const valueSize = Math.round(sp(frame, 0.048) * frame.w);
  const labelY = y + sp(frame, 0.02) * frame.w;
  const valueY = labelY + valueSize * 0.95;

  stats.forEach((s, i) => {
    const x = pad + i * colW;
    if (i > 0) {
      ctx.strokeStyle = p.hair;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - sp(frame, 0.018) * frame.w, labelY - labelSize);
      ctx.lineTo(
        x - sp(frame, 0.018) * frame.w,
        valueY + sp(frame, 0.006) * frame.w,
      );
      ctx.stroke();
    }
    ctx.fillStyle = p.faint;
    ctx.font = `600 ${labelSize}px ${FONT_SANS}`;
    ctx.fillText(s.label.toUpperCase(), x, labelY);
    ctx.fillStyle = p.ink;
    ctx.font = `700 ${valueSize}px ${FONT_MONO}`;
    ctx.fillText(
      clip(ctx, s.value, colW - sp(frame, 0.02) * frame.w),
      x,
      valueY,
    );
  });

  return valueY + sp(frame, 0.06) * frame.w;
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

/** Top edge of the footer zone — the floor every zone above it must clear. */
function footerTop(frame: Frame, pad: number): number {
  const identityH = sp(frame, 0.028) * frame.w + sp(frame, 0.05) * frame.w;
  const taglineH = frame.showTagline ? sp(frame, 0.07) * frame.w : 0;
  return frame.h - frame.safeBottom - pad - identityH - taglineH;
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
  let y = footerTop(frame, pad);

  if (frame.showTagline) {
    y += sp(frame, 0.03) * frame.w;
    ctx.fillStyle = p.soft;
    ctx.font = `italic 500 ${Math.round(sp(frame, 0.028) * frame.w)}px ${FONT_SANS}`;
    ctx.fillText(clip(ctx, tagline, contentW), pad, y);
    y += sp(frame, 0.045) * frame.w;
  }

  ctx.strokeStyle = p.hair;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(frame.w - pad, y);
  ctx.stroke();
  y += sp(frame, 0.038) * frame.w;

  const { left, right } = identityLine(identity);
  ctx.fillStyle = p.faint;
  ctx.font = `500 ${Math.round(sp(frame, 0.024) * frame.w)}px ${FONT_MONO}`;
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
  if (!ctx) throw new Error("2D canvas context unavailable");
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
    drawFrogMark(ctx, mark, pad, y, markSize);
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
    drawFrogMark(
      ctx,
      mark,
      colW + (frame.w - colW - bigSize) / 2,
      (frame.h - bigSize) / 2,
      bigSize,
    );
  } catch {
    // Left column already carries the wordmark.
  }
}
