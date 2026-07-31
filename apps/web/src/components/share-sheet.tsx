import type {
  SessionCard,
  SessionCardBlock,
  SessionSetRef,
  ShareCard,
} from "@frog/core";
import { formatHeroSet, HERO_DURATION_UNIT } from "@frog/core";
import { Camera, Download, Share2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  sampleToken,
} from "@/lib/share/grounds";
import { paintShareCard } from "@/lib/share/paint";
import {
  loadImageFromBlob,
  loadImageFromUrl,
  releaseImage,
} from "@/lib/share/photo-image";
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
    // The chip states exactly what the card will paint once it is tapped —
    // same formatter, so the two can never disagree.
    const hero = formatHeroSet(block, s, unit);
    const inlineUnit =
      hero.unit === HERO_DURATION_UNIT ? "" : (hero.unit ?? "");
    const value = inlineUnit ? `${hero.value} ${inlineUnit}` : hero.value;
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
  selectedId,
  onSelect,
}: {
  sessionId: string | undefined;
  selected: HTMLImageElement | null;
  /** Media row id of the chosen session photo, or null for a camera capture —
   * the decoded image alone can't say which thumbnail produced it. */
  selectedId: string | null;
  onSelect: (img: HTMLImageElement | null, mediaId: string | null) => void;
}) {
  const { data: photos = [] } = useSessionMedia(sessionId ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function pickSessionPhoto(url: string, mediaId: string) {
    setBusy(true);
    setFailed(false);
    try {
      onSelect(await loadImageFromUrl(url), mediaId);
    } catch {
      // A signed storage URL can expire between the media query and this tap.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function onCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setFailed(false);
    try {
      const resized = await resizePhoto(file, 1280);
      onSelect(await loadImageFromBlob(resized), null);
    } catch {
      setFailed(true);
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
              onClick={() => void pickSessionPhoto(p.url as string, p.row.id)}
              aria-pressed={p.row.id === selectedId}
              className={cn(
                "size-16 shrink-0 border object-cover transition-colors duration-150",
                p.row.id === selectedId ? "border-accent" : "border-border",
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
      {failed && (
        <p className="text-2xs text-neg" data-testid="share-photo-error">
          That photo wouldn't load. Try another, or reopen the sheet to refresh.
        </p>
      )}
      {!selected && !failed && (
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
  const paintQueue = useRef<Promise<void>>(Promise.resolve());
  const [frame, setFrame] = useState<FrameKind>("story");
  const [ground, setGround] = useState<Ground>(
    source.kind === "static" && source.card.kind === "pr" ? "green" : "dark",
  );
  const [heroSet, setHeroSet] = useState<SessionSetRef | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [photoMediaId, setPhotoMediaId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [paintFailed, setPaintFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // The picked photo's object URL has to outlive its decode (see
  // releaseImage) — the sheet owns it, and frees it when the photo is swapped
  // or the sheet closes.
  const photoRef = useRef<HTMLImageElement | null>(null);
  function selectPhoto(img: HTMLImageElement | null, mediaId: string | null) {
    if (photoRef.current !== img) releaseImage(photoRef.current);
    photoRef.current = img;
    setPhoto(img);
    setPhotoMediaId(img ? mediaId : null);
  }
  useEffect(
    () => () => {
      releaseImage(photoRef.current);
      photoRef.current = null;
    },
    [],
  );

  // Lazy initializers (not useRef(expr), which re-evaluates its argument on
  // every render even though it only keeps the first result) — sampled/built
  // once per sheet, not every render.
  const [accent] = useState(() => sampleToken("--accent", "#46a758"));
  // Session cards are never "pr"/"streak" kinds, so their tone is "normal"
  // without building the card — building one here just to read `kind` off it
  // would run a full volume + muscle-credit pass and throw the result away.
  const [tagline] = useState(() =>
    randomTagline(
      tone ?? (source.kind === "static" ? toneFor(source.card) : "normal"),
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

  // Re-paint whenever anything the card depends on changes — this ALSO
  // pre-renders the export blob (iOS defensive fix, report §2.5/§6 step 5):
  // navigator.share must be called inside the tap's own gesture, so the async
  // render can't happen at tap time. It happens here, ahead of it. This is the
  // ONLY thing that paints: the canvas takes a plain object ref (attached
  // during commit, before this effect runs) rather than a callback ref, which
  // would re-fire on every dep change and race a second paint against this one.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let live = true;
    // The blob on hand belongs to the outgoing render — drop it so Share/Save
    // stay disabled until this paint produces the image the user is looking at.
    setPendingFile(null);
    setPaintFailed(false);
    const run = paintQueue.current.then(async () => {
      if (!live) return;
      try {
        await paintShareCard(el, {
          frame,
          ground,
          card,
          tagline,
          accent,
          photo,
        });
        if (!live) return;
        const blob = await toBlob(el);
        if (!live) return;
        if (!blob) throw new Error("canvas produced no image");
        setPendingFile(
          new File([blob], `${filename}.png`, { type: "image/png" }),
        );
      } catch {
        // A 2D context or an export can fail outright (iOS Safari under
        // memory pressure on a 1080×1920 canvas). Say so and leave Share/Save
        // disabled rather than handing the user a blank card.
        if (live) setPaintFailed(true);
      }
    });
    // Superseded paints are skipped, not aborted mid-draw — chaining keeps a
    // slow earlier run from repainting the canvas after a later one finished.
    paintQueue.current = run;
    return () => {
      live = false;
    };
  }, [frame, ground, card, tagline, accent, photo, filename]);

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
            ref={canvasRef}
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
            selectedId={photoMediaId}
            onSelect={selectPhoto}
          />
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-4 max-md:pb-safe-footer">
        {paintFailed && (
          <p className="text-2xs text-neg" data-testid="share-paint-error">
            This card wouldn't render. Try another frame or ground, or reopen
            the sheet.
          </p>
        )}
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
  disabled = false,
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
  /** For callers whose card data is still loading — a card built from a cold
   * cache states wrong numbers as fact (see post-save-summary.tsx). */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Building your card…" : "Share as image"}
        data-testid={testId}
        className={className}
      >
        <Share2 className="size-4" />
        {label}
      </Button>
      {open && !disabled && (
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
