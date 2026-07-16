import { newId } from "@sbl/core";
import { ChevronLeft, ChevronRight, ImagePlus, Trash2, X } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDeleteSessionMedia, useSessionMedia } from "@/lib/media-queries";
import { resizePhoto } from "@/lib/photo";
import { cn } from "@/lib/utils";

// Workout photos (Hevy-parity M9). Two surfaces share this file: the finish
// overlay's add-strip (≤3, reorder/remove BEFORE save — uploads are deferred to
// the workout save so a discarded workout never orphans storage objects), and
// the history-detail carousel (signed URLs, delete via the ⋯ menu).

const MAX_PHOTOS = 3;
const MAX_DIM = 1280;

/** A resized-but-not-yet-uploaded finish-strip photo. */
export type PendingPhoto = { id: string; blob: Blob; url: string };

/**
 * Finish-overlay photo strip. Fully controlled: the parent owns the ordered
 * list and uploads it (position = index) when the workout saves. Object URLs
 * are revoked on unmount to avoid leaks.
 */
export function FinishPhotoStrip({
  photos,
  onChange,
}: {
  photos: PendingPhoto[];
  onChange: (next: PendingPhoto[]) => void;
}) {
  // Revoke object URLs on unmount only (a deps list would revoke live URLs
  // mid-edit). A ref tracks the latest set so the cleanup frees what's actually
  // outstanding, not the stale initial closure.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.url);
    },
    [],
  );

  async function onPicked(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const room = MAX_PHOTOS - photos.length;
    const added: PendingPhoto[] = [];
    for (const file of files.slice(0, room)) {
      // Fall back to the original file if the downscale can't decode it, so a
      // codec hiccup never silently drops the user's photo.
      const blob = await resizePhoto(file, MAX_DIM).catch(() => file);
      added.push({ id: newId(), blob, url: URL.createObjectURL(blob) });
    }
    if (added.length) onChange([...photos, ...added]);
  }

  function remove(id: string) {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    onChange(photos.filter((x) => x.id !== id));
  }

  function move(id: string, dir: -1 | 1) {
    const i = photos.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs font-medium tracking-wide text-faint uppercase">
        Photos
      </span>
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="finish-photos"
      >
        {photos.map((p, i) => (
          <div
            key={p.id}
            className="group relative size-16 border border-border"
            data-testid={`finish-photo-${i}`}
          >
            <img src={p.url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p.id)}
              title="Remove photo"
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center border border-border bg-bg text-faint transition-colors duration-150 hover:text-neg"
              data-testid={`finish-photo-remove-${i}`}
            >
              <X className="size-3" />
            </button>
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-(--overlay) opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => move(p.id, -1)}
                disabled={i === 0}
                title="Move left"
                className="flex size-5 items-center justify-center text-white disabled:opacity-30"
                data-testid={`finish-photo-left-${i}`}
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(p.id, 1)}
                disabled={i === photos.length - 1}
                title="Move right"
                className="flex size-5 items-center justify-center text-white disabled:opacity-30"
                data-testid={`finish-photo-right-${i}`}
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label
            className="flex size-16 cursor-pointer flex-col items-center justify-center gap-1 border border-border border-dashed bg-translucent text-faint transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
            data-testid="finish-photo-add"
          >
            <ImagePlus className="size-5" />
            <span className="text-3xs">Add</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => void onPicked(e)}
              className="hidden"
              data-testid="finish-photo-input"
            />
          </label>
        )}
      </div>
    </div>
  );
}

/** History-detail photo carousel with per-photo delete (⋯ → confirm). Renders
 * nothing until the session has at least one photo. */
export function SessionPhotoCarousel({ sessionId }: { sessionId: string }) {
  const { data: photos = [] } = useSessionMedia(sessionId);
  const del = useDeleteSessionMedia(sessionId);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (photos.length === 0) return null;

  return (
    <div
      className="mt-4 flex snap-x gap-2 overflow-x-auto pb-1"
      data-testid="history-photos"
    >
      {photos.map(({ row, url }) => (
        <div
          key={row.id}
          className="relative shrink-0 snap-start"
          data-testid={`history-photo-${row.position}`}
        >
          {url ? (
            <img
              src={url}
              alt="Workout"
              loading="lazy"
              className="h-40 w-auto max-w-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center border border-border bg-surface-2 text-2xs text-faint">
              Unavailable
            </div>
          )}
          {confirmId === row.id ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-(--overlay) p-2 text-center">
              <span className="text-xs text-white">Delete photo?</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmId(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    del.mutate(row.id);
                    setConfirmId(null);
                  }}
                  data-testid={`history-photo-delete-confirm-${row.position}`}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmId(row.id)}
              title="Delete photo"
              className={cn(
                "absolute top-1 right-1 flex size-6 items-center justify-center",
                "border border-border bg-bg/80 text-faint backdrop-blur",
                "transition-colors duration-150 hover:text-neg",
              )}
              data-testid={`history-photo-delete-${row.position}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
