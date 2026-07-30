import { APP_NAME } from "@frog/core";
import { Download, Share2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { FrogMark } from "@/components/frog-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { randomTagline } from "@/lib/frog-tagline";
import { cn } from "@/lib/utils";

// Share-as-image cards (Hevy-parity M9, plan §D; redesign docs/DECISIONS.md
// 2026-07-30). A branded PNG rendered entirely on a <canvas> — zero
// dependencies, no network, no hosting. Social pillar is deliberately out of
// scope: there are no links or uploads, only a client-rendered image the user
// can share via the OS sheet (navigator.share) or save to their device.
// Three background variants (dark/light/transparent) mirror Hevy's background
// switcher; transparent is meant for overlaying on a photo in the destination
// app, so it draws light text with a soft shadow.
//
// The card matches the app's own design system exactly rather than
// approximating it: colors are sampled at render time from the real Radix
// grass/sage tokens (theme.css), never a hand-picked hex that can drift, and
// the brand mark is rasterized from the shared FrogMark component — never a
// third hand-copy of its path geometry (AGENTS.md already flags two).

export type ShareStat = { label: string; value: string };

export type ShareCardData = {
  /** Small eyebrow above the title — e.g. "Workout #47" or "New PR". */
  kicker?: string;
  title: string;
  /** Date / context line under the title. */
  subtitle?: string;
  /** Key/value grid (duration, sets, volume…). */
  stats?: ShareStat[];
  /** Freeform bullet lines — e.g. PRs earned or the exercise list. */
  lines?: string[];
  /** Session-quality signal the caller already computed (a PR landed this
   * session) — biases the frog-sass tagline's tone. Never invented just for
   * the caption; when the caller has no such signal, omit it. */
  strong?: boolean;
};

type Variant = "dark" | "light" | "transparent";

const VARIANTS: Variant[] = ["dark", "light", "transparent"];
const VARIANT_LABELS: Record<Variant, string> = {
  dark: "Dark",
  light: "Light",
  transparent: "Transparent",
};

// Portrait 4:5 — reads well in a feed and crops safely to a 9:16 story.
const W = 1080;
const H = 1350;
const PAD = 96;
const MARK_SIZE = 84;

// Same faces the app uses (theme.css `--font-sans` / `--font-mono`): sans for
// everything, the fixed-width mono stack for numeric values — canvas text
// can't do `font-variant-numeric: tabular-nums`, but these families are
// inherently fixed-width, which gets the same aligned-digits result the
// app's `.num` utility achieves in the DOM.
const FONT_SANS = `"Bricolage Grotesque", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
const FONT_MONO = `ui-monospace, "SF Mono", "Berkeley Mono", Menlo, monospace`;

type Palette = {
  bg: string | null; // null = leave the canvas transparent
  ink: string;
  soft: string;
  faint: string;
  hair: string; // hairline / divider
  accent: string;
  shadow: boolean; // draw a text shadow (transparent overlay legibility)
};

/** Resolve a raw Radix scale step (`--sage-N`, `--grass-N`) under a FORCED
 * light/dark class, not the page's live theme — so picking "Dark" always
 * looks the same regardless of which theme the app is currently in. Radix's
 * scale files key off a flat `.light`/`.dark` class on any element (not
 * `:root`-scoped), so a detached, temporarily-classed span resolves the
 * requested theme's value correctly. */
function sampleForcedToken(
  themeClass: "light" | "dark",
  cssVar: string,
  fallback: string,
): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("span");
  el.className = themeClass;
  el.style.display = "none";
  el.style.color = `var(${cssVar})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c || fallback;
}

/** Resolve a token against the page's LIVE theme — only for values that are
 * identical across light/dark (the grass accent never changes by theme). */
function sampleLiveToken(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("span");
  el.style.display = "none";
  el.style.color = `var(${cssVar})`;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c || fallback;
}

function paletteFor(variant: Variant, accent: string): Palette {
  switch (variant) {
    case "light":
      return {
        bg: "#ffffff", // theme.css `:root { --bg: white }` — not sage-2
        ink: sampleForcedToken("light", "--sage-12", "#1a211e"),
        soft: sampleForcedToken("light", "--sage-11", "#5f6563"),
        faint: sampleForcedToken("light", "--sage-10", "#7c8481"),
        hair: sampleForcedToken("light", "--sage-6", "#d7dad9"),
        accent,
        shadow: false,
      };
    case "transparent":
      return {
        bg: null,
        ink: "#ffffff",
        soft: "rgba(255,255,255,0.82)",
        faint: "rgba(255,255,255,0.62)",
        hair: "rgba(255,255,255,0.28)",
        accent,
        shadow: true,
      };
    default:
      return {
        // theme.css `:root.dark { --bg: var(--sage-1) }`
        bg: sampleForcedToken("dark", "--sage-1", "#101211"),
        ink: sampleForcedToken("dark", "--sage-12", "#eceeed"),
        soft: sampleForcedToken("dark", "--sage-11", "#adb5b2"),
        faint: sampleForcedToken("dark", "--sage-10", "#717d79"),
        hair: sampleForcedToken("dark", "--sage-6", "#373b39"),
        accent,
        shadow: false,
      };
  }
}

// Rasterized FrogMark, keyed by its resolved colors — cheap to redo (a ~1 kB
// inline SVG) but no reason to re-decode on every repaint of the same variant.
const markImageCache = new Map<string, HTMLImageElement>();

function loadFrogMarkImage(
  outline: string,
  accent: string,
): Promise<HTMLImageElement> {
  const key = `${outline}|${accent}`;
  const cached = markImageCache.get(key);
  if (cached) return Promise.resolve(cached);

  // Rasterize the SAME component the rest of the app uses for its brand mark
  // — never a third hand-copy of the path geometry. Mounted into a detached
  // host via the app's own react-dom/client (already loaded; react-dom/server
  // would double the bundle for this one icon) and read back with the native
  // XMLSerializer, so no react-dom/server import is needed. FrogMark's
  // outline is `currentColor` and its body is `var(--accent)`; set both via
  // inline style/custom-property so the serialized SVG (no access to the
  // page's live CSS once it's a standalone document) resolves the requested
  // palette.
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-9999px";
  document.body.appendChild(host);
  const root = createRoot(host);
  const style = { color: outline, "--accent": accent } as CSSProperties;
  flushSync(() => root.render(<FrogMark style={style} />));
  // XMLSerializer already includes xmlns on an SVG element (it's in the SVG
  // namespace in the live DOM) — no need to inject one.
  const svgEl = host.querySelector("svg");
  const markup = svgEl ? new XMLSerializer().serializeToString(svgEl) : "";
  root.unmount();
  host.remove();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      markImageCache.set(key, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("frog mark failed to rasterize"));
    img.src = url;
  });
}

/** Draw the card onto `canvas` at full resolution. */
export async function renderShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  variant: Variant,
  accent: string,
  tagline: string,
) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const p = paletteFor(variant, accent);

  ctx.clearRect(0, 0, W, H);
  if (p.bg) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, W, H);
  }

  // The background fill above is enough for a "the card painted" check —
  // everything below (including the async mark rasterization) can safely
  // take a beat without the card reading as blank.
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

  let y = PAD;

  // Header lockup: frog mark + wordmark (matches the nav shell's mark +
  // APP_NAME pairing), then a hairline rule — not an arbitrary accent block.
  shadow();
  try {
    const mark = await loadFrogMarkImage(p.ink, p.accent);
    ctx.drawImage(mark, PAD, y, MARK_SIZE, MARK_SIZE);
  } catch {
    // Rasterizing the mark failed — the wordmark alone still reads fine.
  }
  ctx.fillStyle = p.ink;
  ctx.font = `700 40px ${FONT_SANS}`;
  ctx.textBaseline = "middle";
  ctx.fillText(APP_NAME.toUpperCase(), PAD + MARK_SIZE + 24, y + MARK_SIZE / 2);
  ctx.textBaseline = "alphabetic";

  y += MARK_SIZE + 40;
  ctx.strokeStyle = p.hair;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  // Kicker (eyebrow).
  if (data.kicker) {
    y += 76;
    ctx.fillStyle = p.accent;
    ctx.font = `700 40px ${FONT_SANS}`;
    ctx.fillText(data.kicker.toUpperCase(), PAD, y);
  }

  // Title (wrapped, up to 3 lines).
  y += 92;
  ctx.fillStyle = p.ink;
  ctx.font = `800 84px ${FONT_SANS}`;
  y = wrap(ctx, data.title, PAD, y, W - PAD * 2, 92, 3);

  // Subtitle.
  if (data.subtitle) {
    y += 54;
    ctx.fillStyle = p.soft;
    ctx.font = `500 40px ${FONT_SANS}`;
    ctx.fillText(data.subtitle, PAD, y);
  }

  // Stats grid (two columns) — values in the mono/tabular face, like `.num`.
  if (data.stats?.length) {
    y += 96;
    const colW = (W - PAD * 2) / 2;
    for (let i = 0; i < data.stats.length; i++) {
      const s = data.stats[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = PAD + col * colW;
      const ry = y + row * 172;
      ctx.fillStyle = p.faint;
      ctx.font = `600 30px ${FONT_SANS}`;
      ctx.fillText(s.label.toUpperCase(), x, ry);
      ctx.fillStyle = p.ink;
      ctx.font = `700 76px ${FONT_MONO}`;
      ctx.fillText(s.value, x, ry + 78);
    }
    y += Math.ceil(data.stats.length / 2) * 172;
  }

  // Bullet lines (PRs / exercise list).
  if (data.lines?.length) {
    y += 40;
    ctx.strokeStyle = p.hair;
    ctx.lineWidth = 2;
    for (const line of data.lines.slice(0, 8)) {
      y += 64;
      if (y > H - PAD - 40) break;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(PAD + 7, y - 14, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.soft;
      ctx.font = `500 42px ${FONT_SANS}`;
      ctx.fillText(clip(ctx, line, W - PAD * 2 - 48), PAD + 40, y);
    }
  }

  // Frog-sass tagline — the one goofy line on an otherwise serious card
  // (the split rule: edges get the frog voice, data stays deadpan).
  ctx.fillStyle = p.soft;
  ctx.font = `italic 500 32px ${FONT_SANS}`;
  ctx.fillText(clip(ctx, tagline, W - PAD * 2), PAD, H - PAD - 56);

  // Footer.
  ctx.fillStyle = p.faint;
  ctx.font = `500 30px ${FONT_SANS}`;
  ctx.fillText(`Tracked with ${APP_NAME}`, PAD, H - PAD);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

// Word-wrap `text`, returning the baseline y of the last line drawn.
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = test;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const drawn = lines.slice(0, maxLines);
  // If truncated, ellipsize the last line.
  if (
    lines.length >= maxLines &&
    words.length > drawn.join(" ").split(/\s+/).length
  )
    drawn[drawn.length - 1] = clip(ctx, `${drawn[drawn.length - 1]}…`, maxW);
  let cy = y;
  for (let i = 0; i < drawn.length; i++) {
    if (i > 0) cy += lineH;
    ctx.fillText(drawn[i], x, cy);
  }
  return cy;
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

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The share sheet: a live preview, a dark/light/transparent switcher, and two
// actions — Share (OS share sheet, when the browser supports sharing files) and
// Save image (always a plain download). Rendered lazily (only mounted when the
// user taps a Share button) so canvas work never touches the logging path.
function ShareSheet({
  data,
  filename,
  onClose,
}: {
  data: ShareCardData;
  filename: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [variant, setVariant] = useState<Variant>("dark");
  const [busy, setBusy] = useState(false);
  // Sampled/picked once — the app accent is the same grass green in light and
  // dark, and the tagline is this share's caption, not a per-render reroll.
  const accent = useRef(sampleLiveToken("--accent", "#46a758")).current;
  const tagline = useRef(
    randomTagline(data.strong ? "strong" : "normal"),
  ).current;
  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function";

  // Callback ref: paint the moment the canvas attaches (a plain useEffect can
  // fire before the Radix-portalled canvas mounts, leaving it blank), and again
  // whenever data/variant/accent change — the callback's identity changes with
  // them, so React re-invokes it.
  const attachCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      if (el) void renderShareCard(el, data, variant, accent, tagline);
    },
    [data, variant, accent, tagline],
  );

  async function currentBlob(): Promise<Blob | null> {
    return canvasRef.current ? toBlob(canvasRef.current) : null;
  }

  async function save() {
    const blob = await currentBlob();
    if (blob) downloadBlob(blob, `${filename}.png`);
  }

  async function share() {
    setBusy(true);
    try {
      const blob = await currentBlob();
      if (!blob) return;
      const file = new File([blob], `${filename}.png`, { type: "image/png" });
      if (canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: data.title });
      } else {
        downloadBlob(blob, `${filename}.png`);
      }
    } catch {
      // User dismissed the OS sheet, or sharing failed — no-op.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Share"
        className="md:max-w-sm"
        data-testid="share-sheet"
      >
        <div className="flex flex-col gap-4">
          <div className="flex justify-center bg-[repeating-conic-gradient(var(--surface-2)_0_25%,transparent_0_50%)] bg-[length:24px_24px] p-3">
            <canvas
              ref={attachCanvas}
              className="h-auto w-48 border border-border"
              data-testid="share-canvas"
            />
          </div>

          <div className="flex items-center gap-2" data-testid="share-variants">
            {VARIANTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className={cn(
                  "num h-8 flex-1 border text-2xs transition-colors duration-150",
                  v === variant
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
                )}
                data-testid={`share-variant-${v}`}
              >
                {VARIANT_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => void save()}
              data-testid="share-save"
            >
              <Download className="size-4" />
              Save image
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() => void share()}
              data-testid="share-export"
            >
              <Share2 className="size-4" />
              Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A Share button that opens the share sheet for `data`. `testId` disambiguates
 * multiple share buttons on one screen (e.g. per-slide in the post-save
 * summary). `filename` (without extension) names the downloaded PNG. */
export function ShareButton({
  data,
  filename,
  testId = "share-btn",
  variant = "outline",
  size = "sm",
  label = "Share",
  className,
}: {
  data: ShareCardData;
  filename: string;
  testId?: string;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
  label?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        title="Share as image"
        data-testid={testId}
        className={className}
      >
        <Share2 className="size-4" />
        {label}
      </Button>
      {open && (
        <ShareSheet
          data={data}
          filename={filename}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
