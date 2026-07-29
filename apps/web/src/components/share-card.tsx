import { APP_NAME } from "@frog/core";
import { Download, Share2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Share-as-image cards (Hevy-parity M9, plan §D). A clean branded PNG rendered
// entirely on a <canvas> — zero dependencies, no network, no hosting. Social
// pillar is deliberately out of scope: there are no links or uploads, only a
// client-rendered image the user can share via the OS sheet (navigator.share)
// or save to their device. Three background variants (dark/light/transparent)
// mirror Hevy's background switcher; transparent is meant for overlaying on a
// photo in the destination app, so it draws light text with a soft shadow.

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

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif`;

type Palette = {
  bg: string | null; // null = leave the canvas transparent
  ink: string;
  soft: string;
  faint: string;
  hair: string; // hairline / divider
  accent: string;
  shadow: boolean; // draw a text shadow (transparent overlay legibility)
};

function paletteFor(variant: Variant, accent: string): Palette {
  switch (variant) {
    case "light":
      return {
        bg: "#f5f8f5",
        ink: "#1a211e",
        soft: "#5f6563",
        faint: "#868e8b",
        hair: "#dfe2e0",
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
        accent: "#ffffff",
        shadow: true,
      };
    default:
      return {
        bg: "#101211",
        ink: "#eceeed",
        soft: "#adb5b2",
        faint: "#717d79",
        hair: "#2e3130",
        accent,
        shadow: false,
      };
  }
}

/** Resolve a CSS custom property to a concrete rgb() string usable on canvas. */
function sampleToken(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const el = document.createElement("span");
  el.style.color = `var(${cssVar})`;
  el.style.display = "none";
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c || fallback;
}

/** Draw the card onto `canvas` at full resolution. */
export function renderShareCard(
  canvas: HTMLCanvasElement,
  data: ShareCardData,
  variant: Variant,
  accent: string,
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

  // Accent rule down the left gutter — the one flash of brand color.
  ctx.fillStyle = p.accent;
  ctx.fillRect(PAD, PAD, 64, 8);

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

  let y = PAD + 8;

  // Wordmark.
  y += 74;
  shadow();
  ctx.fillStyle = p.soft;
  ctx.font = `600 34px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(APP_NAME.toUpperCase(), PAD, y);

  // Kicker (eyebrow).
  if (data.kicker) {
    y += 96;
    ctx.fillStyle = p.accent;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(data.kicker.toUpperCase(), PAD, y);
  }

  // Title (wrapped, up to 3 lines).
  y += 92;
  ctx.fillStyle = p.ink;
  ctx.font = `800 84px ${FONT}`;
  y = wrap(ctx, data.title, PAD, y, W - PAD * 2, 92, 3);

  // Subtitle.
  if (data.subtitle) {
    y += 54;
    ctx.fillStyle = p.soft;
    ctx.font = `500 40px ${FONT}`;
    ctx.fillText(data.subtitle, PAD, y);
  }

  // Stats grid (two columns).
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
      ctx.font = `600 30px ${FONT}`;
      ctx.fillText(s.label.toUpperCase(), x, ry);
      ctx.fillStyle = p.ink;
      ctx.font = `700 76px ${FONT}`;
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
      ctx.font = `500 42px ${FONT}`;
      ctx.fillText(clip(ctx, line, W - PAD * 2 - 48), PAD + 40, y);
    }
  }

  // Footer.
  shadow();
  ctx.fillStyle = p.faint;
  ctx.font = `500 30px ${FONT}`;
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
  // Sampled once — the app accent is the same grass green in light and dark.
  const accent = useRef(sampleToken("--accent", "#46a758")).current;
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
      if (el) renderShareCard(el, data, variant, accent);
    },
    [data, variant, accent],
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
