import type {
  SessionCard,
  SessionCardBlock,
  SessionSetRef,
  ShareCard,
} from "@frog/core";
import { toDisplayWeight, unitLabel } from "@frog/core";
import { Camera, Download, Share2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { randomTagline, type Tone } from "@/lib/frog-tagline";
import { useSessionMedia } from "@/lib/media-queries";
import { resizePhoto } from "@/lib/photo";
import { useUnit } from "@/lib/settings";
import { FRAME_LABELS, FRAME_ORDER, type FrameKind } from "@/lib/share/frames";
import {
  GROUND_LABELS,
  GROUNDS,
  type Ground,
  sampleLiveToken,
} from "@/lib/share/grounds";
import { paintShareCard } from "@/lib/share/paint";
import { loadImageFromBlob, loadImageFromUrl } from "@/lib/share/photo-image";
import { cn } from "@/lib/utils";

export type ShareSource =
  | {
      kind: "session";
      blocks: SessionCardBlock[];
      build: (heroSet?: SessionSetRef | null) => SessionCard;
    }
  | { kind: "static"; card: ShareCard };

function heroSetLabel(
  block: SessionCardBlock,
  unit: "kg" | "lb",
): Array<{ id: string; setId: string; label: string }> {
  return block.sets.map((s) => {
    let value: string;
    if (s.weightKg != null && s.weightKg > 0) {
      value = `${toDisplayWeight(s.weightKg, unit)} ${unitLabel(unit)}${s.reps ? ` × ${s.reps}` : ""}`;
    } else if (s.reps != null) {
      value = `${s.reps} reps`;
    } else if (s.durationSec != null) {
      value = `${Math.round(s.durationSec)}s`;
    } else {
      value = "—";
    }
    return {
      id: `${block.exerciseId}:${s.id}`,
      setId: s.id,
      label: `${block.exerciseName} · ${value}`,
    };
  });
}

function HeroSetPicker({
  blocks,
  unit,
  heroSet,
  onPick,
}: {
  blocks: SessionCardBlock[];
  unit: "kg" | "lb";
  heroSet: SessionSetRef | null;
  onPick: (ref: SessionSetRef | null) => void;
}) {
  const items = blocks.flatMap((b) =>
    heroSetLabel(b, unit).map((s) => ({ ...s, exerciseId: b.exerciseId })),
  );
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium tracking-widest text-faint uppercase">
        Headline set
      </span>
      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        data-testid="share-hero-picker"
      >
        <button
          type="button"
          onClick={() => onPick(null)}
          className={cn(
            "h-10 shrink-0 whitespace-nowrap px-3 text-xs transition-colors duration-150",
            heroSet === null
              ? "bg-accent-soft text-accent"
              : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
          )}
          data-testid="share-hero-auto"
        >
          Auto (top set)
        </button>
        {items.map((item) => {
          const selected =
            heroSet?.exerciseId === item.exerciseId &&
            heroSet?.setId === item.setId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onPick({ exerciseId: item.exerciseId, setId: item.setId })
              }
              className={cn(
                "h-10 shrink-0 whitespace-nowrap px-3 text-xs transition-colors duration-150",
                selected
                  ? "bg-accent-soft text-accent"
                  : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
              )}
              data-testid={`share-hero-set-${item.setId}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChipRow<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
  testIdPrefix,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium tracking-widest text-faint uppercase">
        {label}
      </span>
      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        data-testid={`${testIdPrefix}s`}
      >
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              "h-10 shrink-0 whitespace-nowrap px-4 text-xs transition-colors duration-150",
              o === value
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
              "border",
            )}
            data-testid={`${testIdPrefix}-${o}`}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

function PhotoPicker({
  sessionId,
  selected,
  onSelect,
}: {
  sessionId: string | undefined;
  selected: HTMLImageElement | null;
  onSelect: (img: HTMLImageElement | null) => void;
}) {
  const { data: photos = [] } = useSessionMedia(sessionId ?? "");
  const [busy, setBusy] = useState(false);

  async function pickSessionPhoto(url: string) {
    setBusy(true);
    try {
      onSelect(await loadImageFromUrl(url));
    } finally {
      setBusy(false);
    }
  }

  async function onCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const resized = await resizePhoto(file, 1280);
      onSelect(await loadImageFromBlob(resized));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium tracking-widest text-faint uppercase">
        Photo
      </span>
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1"
        data-testid="share-photo-picker"
      >
        {photos
          .filter((p) => p.url)
          .map((p) => (
            <button
              key={p.row.id}
              type="button"
              disabled={busy}
              onClick={() => void pickSessionPhoto(p.url as string)}
              className={cn(
                "size-16 shrink-0 border object-cover",
                selected ? "border-border" : "border-border",
              )}
              data-testid={`share-photo-${p.row.position}`}
            >
              <img
                src={p.url as string}
                alt=""
                className="size-full object-cover"
              />
            </button>
          ))}
        <label
          className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 border border-border border-dashed bg-translucent text-faint transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
          data-testid="share-photo-camera"
        >
          <Camera className="size-5" />
          <span className="text-3xs">Camera</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void onCapture(e)}
            className="hidden"
          />
        </label>
      </div>
      {!selected && (
        <p className="text-2xs text-faint">
          Pick a photo above to preview the Photo ground.
        </p>
      )}
    </div>
  );
}

function toneFor(card: ShareCard): Tone {
  if (card.kind === "pr") return "pr";
  if (card.kind === "streak") return "streak";
  return "normal";
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

/** Exported alongside `ShareButton` for callers that need their own gating
 * before the sheet opens (e.g. measures.tsx's one-time confirm before
 * sharing a bodyweight/measurement card — report §5.2/§7.2: never
 * auto-offered, never in a default carousel). Most callers want `ShareButton`
 * instead, which owns its own trigger + open state. */
export function ShareSheet({
  source,
  sessionId,
  tone,
  filename,
  onClose,
}: {
  source: ShareSource;
  sessionId?: string;
  tone?: Tone;
  filename: string;
  onClose: () => void;
}) {
  const { unit } = useUnit();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frame, setFrame] = useState<FrameKind>("story");
  const [ground, setGround] = useState<Ground>(
    source.kind === "static" && source.card.kind === "pr" ? "green" : "dark",
  );
  const [heroSet, setHeroSet] = useState<SessionSetRef | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Lazy initializers (not useRef(expr), which re-evaluates its argument on
  // every render even though it only keeps the first result) — sampled/built
  // once per sheet, not every render.
  const [accent] = useState(() => sampleLiveToken("--accent", "#46a758"));
  const [tagline] = useState(() =>
    randomTagline(
      tone ?? toneFor(source.kind === "static" ? source.card : source.build()),
    ),
  );

  // Memoized, not recomputed inline: recomputing `card` fresh on every render
  // would give the paint effect below a new object identity each time even
  // when nothing it depends on changed, and since that effect's own
  // `setPendingFile` triggers a re-render, an unmemoized card would repaint
  // in a loop (report §2.5's "repaint-per-render" bug, generalized).
  const card: ShareCard = useMemo(
    () => (source.kind === "session" ? source.build(heroSet) : source.card),
    [source, heroSet],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const paint = useCallback(async () => {
    const el = canvasRef.current;
    if (!el) return;
    await paintShareCard(el, { frame, ground, card, tagline, accent, photo });
    const blob = await toBlob(el);
    if (blob)
      setPendingFile(
        new File([blob], `${filename}.png`, { type: "image/png" }),
      );
  }, [frame, ground, card, tagline, accent, photo, filename]);

  useEffect(() => {
    void paint();
    // Re-paint whenever anything the card depends on changes — this ALSO
    // pre-renders the export blob (iOS defensive fix, report §2.5/§6 step 5):
    // navigator.share must be called inside the tap's own gesture, so the
    // async render can't happen at tap time. It happens here, ahead of it.
  }, [paint]);

  const attachCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      if (el) void paint();
    },
    [paint],
  );

  function save() {
    if (pendingFile) downloadBlob(pendingFile, `${filename}.png`);
  }

  async function share() {
    if (!pendingFile) return;
    setBusy(true);
    try {
      const canShareFiles = typeof navigator.canShare === "function";
      if (canShareFiles && navigator.canShare({ files: [pendingFile] })) {
        await navigator.share({ files: [pendingFile], text: tagline });
      } else {
        downloadBlob(pendingFile, `${filename}.png`);
      }
    } catch {
      // User dismissed the OS sheet, or sharing failed — no-op.
    } finally {
      setBusy(false);
    }
  }

  const aspect =
    frame === "story"
      ? "1080 / 1920"
      : frame === "square"
        ? "1080 / 1080"
        : "1080 / 1350";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      data-testid="share-sheet"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">Share</span>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="flex size-10 items-center justify-center text-soft transition-colors duration-150 hover:text-ink"
          data-testid="share-close"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div
          className="mx-auto w-full max-w-sm bg-[repeating-conic-gradient(var(--surface-2)_0_25%,transparent_0_50%)] bg-[length:24px_24px] p-1"
          data-testid="share-preview"
        >
          <canvas
            ref={attachCanvas}
            className="h-auto w-full border border-border"
            style={{ aspectRatio: aspect }}
            data-testid="share-canvas"
          />
        </div>

        {source.kind === "session" && (
          <HeroSetPicker
            blocks={source.blocks}
            unit={unit}
            heroSet={heroSet}
            onPick={setHeroSet}
          />
        )}

        <ChipRow
          label="Frame"
          options={FRAME_ORDER}
          labels={FRAME_LABELS}
          value={frame}
          onChange={setFrame}
          testIdPrefix="share-frame"
        />
        <ChipRow
          label="Ground"
          options={GROUNDS}
          labels={GROUND_LABELS}
          value={ground}
          onChange={setGround}
          testIdPrefix="share-ground"
        />

        {ground === "photo" && (
          <PhotoPicker
            sessionId={sessionId}
            selected={photo}
            onSelect={setPhoto}
          />
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4 max-md:pb-safe-footer">
        <Button
          variant="primary"
          className="h-14 w-full text-sm"
          disabled={busy || !pendingFile}
          onClick={() => void share()}
          data-testid="share-export"
        >
          <Share2 className="size-4" />
          Share
        </Button>
        <Button
          variant="outline"
          className="h-10 w-full text-sm"
          disabled={!pendingFile}
          onClick={save}
          data-testid="share-save"
        >
          <Download className="size-4" />
          Save image
        </Button>
      </div>
    </div>
  );
}

/** A Share button that opens the full-screen share sheet for `source`.
 * `testId` disambiguates multiple share buttons on one screen (e.g.
 * per-slide in the post-save summary). `filename` (without extension) names
 * the downloaded PNG. `sessionId` (optional) powers the Photo ground's
 * "this session's photos" strip. */
export function ShareButton({
  source,
  sessionId,
  tone,
  filename,
  testId = "share-btn",
  variant = "outline",
  size = "sm",
  label = "Share",
  className,
}: {
  source: ShareSource;
  sessionId?: string;
  tone?: Tone;
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
          source={source}
          sessionId={sessionId}
          tone={tone}
          filename={filename}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
