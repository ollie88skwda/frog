// Frame geometry — one layout engine, four frames (share redesign, report
// §5.3). Story is the default (mobile-first, the primary Instagram-story
// surface); Post/Square mirror the old 4:5/1:1 card; OG is the static brand
// image built by scripts/gen-og-image.ts.

export type FrameKind = "story" | "post" | "square" | "og";

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

export const FRAME_ORDER: FrameKind[] = ["story", "post", "square"];
export const FRAME_LABELS: Record<FrameKind, string> = {
  story: "Story",
  post: "Post",
  square: "Square",
  og: "OG",
};
