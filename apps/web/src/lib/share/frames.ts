// Frame geometry — one layout engine, five frames (share redesign, report
// §5.3; landscape added 2026-08-08 per the Instagram canvas pass — see
// docs/DECISIONS.md). Story is the default (mobile-first, the primary
// Instagram-story surface); Post/Square mirror the old 4:5/1:1 card; the
// landscape 16:9 (1080×608, IG's feed crop) is the poster format — its own
// compact two-column layout via the optional knobs below, since the full
// vertical zone stack (~580 px of w-ratio margins + type at 1080 wide) cannot
// fit a 608-tall frame (data/frog-ui-share-canvas/report.md §2.2). OG is the
// static brand image built by scripts/gen-og-image.ts.

export type FrameKind = "story" | "post" | "square" | "landscape" | "og";

export type Frame = {
  kind: FrameKind;
  w: number;
  h: number;
  pad: number;
  /** IG story chrome eats the top/bottom ~250px at 1080 wide — content must
   * stay inside [safeTop, h - safeBottom]. Zero for every other frame. */
  safeTop: number;
  safeBottom: number;
  showTagline: boolean;
  graphicH: number;
  heroPx: number;
  unitPx: number;
  titlePx: number;
  /** Compact-mode knobs — landscape only; every other frame omits them and
   * gets the defaults (spacing ×1, full-size mark, stacked layout, full
   * context). All optional so an existing frame's paint is byte-identical. */
  /** Multiplier on every `frame.w`-ratio margin the painter uses (zone gaps,
   * footer height). 0.6 on landscape — the only way the zones fit 608px. */
  spacing?: number;
  /** Brand-mark size as a ratio of frame width (default 84/1080). */
  markRatio?: number;
  /** "stack" (default) = the A–G vertical zones; "split" = the landscape
   * poster: brand row full-width, left column context+hero, right column
   * graphic+support, footer full-width. */
  layout?: "stack" | "split";
  /** Left-column share of content width when layout === "split". */
  splitRatio?: number;
  /** "full" (default) = eyebrow + title + date (+ conditions strip on session
   * cards); "poster" = eyebrow + title only — the landscape frame's budget
   * has no room for the date/conditions lines (report §2.2). */
  contextMode?: "full" | "poster";
};

export const FRAMES: Record<FrameKind, Frame> = {
  story: {
    kind: "story",
    w: 1080,
    h: 1920,
    pad: 96,
    safeTop: 250,
    safeBottom: 250,
    showTagline: true,
    graphicH: 400,
    heroPx: 220,
    unitPx: 78,
    titlePx: 52,
  },
  post: {
    kind: "post",
    w: 1080,
    h: 1350,
    pad: 96,
    safeTop: 0,
    safeBottom: 0,
    showTagline: false,
    graphicH: 300,
    heroPx: 190,
    unitPx: 68,
    titlePx: 52,
  },
  square: {
    kind: "square",
    w: 1080,
    h: 1080,
    pad: 96,
    safeTop: 0,
    safeBottom: 0,
    showTagline: false,
    graphicH: 160,
    heroPx: 160,
    unitPx: 58,
    titlePx: 48,
  },
  landscape: {
    kind: "landscape",
    w: 1080,
    h: 608,
    pad: 72,
    safeTop: 0,
    safeBottom: 0,
    showTagline: false,
    graphicH: 240,
    heroPx: 104,
    unitPx: 40,
    titlePx: 44,
    // The poster knobs — hand-derived from the painter's zone math (report
    // §2.3); the E2E_EVIDENCE_DIR PNGs are the designed tuning loop.
    spacing: 0.6,
    markRatio: 56 / 1080,
    layout: "split",
    splitRatio: 0.55,
    contextMode: "poster",
  },
  og: {
    kind: "og",
    w: 1200,
    h: 630,
    pad: 107,
    safeTop: 0,
    safeBottom: 0,
    showTagline: false,
    graphicH: 0,
    heroPx: 0,
    unitPx: 0,
    titlePx: 0,
  },
};

export const FRAME_ORDER: FrameKind[] = [
  "story",
  "post",
  "square",
  "landscape",
];
export const FRAME_LABELS: Record<FrameKind, string> = {
  story: "Story",
  post: "Post",
  square: "Square",
  landscape: "16:9",
  og: "OG",
};
