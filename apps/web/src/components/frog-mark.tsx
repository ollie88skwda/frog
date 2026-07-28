import { cn } from "@/lib/utils";

// The frog brand mark as in-app chrome (docs/brand/frog-brand-identity.html).
// This is the simplified cut of public/icon.svg: at the 20-32px it renders at,
// the haunches, nostrils and eye glints collapse into mud, so they are dropped
// and the surviving strokes carry the mark. Geometry is the same silhouette,
// mapped from the tile's 573x357 art space into a 24-unit icon box.
//
// Theme-transparent on purpose — outline currentColor, body var(--accent).
// The app ships light and dark (set before first paint), and a hardcoded dark
// outline would vanish against the dark sage surface. Never swap this for a
// raster: it is ~500 bytes inline against 5-20 kB, and the bundle is CI-gated.
export function FrogMark({
  className,
  strokeWidth = 1.75,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <g
        fill="var(--accent)"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Body: left flank, left eye hump, the valley between, then mirrored. */}
        <path d="M5.21 18.12A9.59 9.59 0 0 1 6.34 8.41A2.26 2.26 0 0 1 9.79 6.23A4.15 4.15 0 0 0 14.21 6.23A2.26 2.26 0 0 1 17.66 8.41A9.59 9.59 0 0 1 18.79 18.12Z" />
        {/* Front feet, mouth, then the ground bar the frog sits on. */}
        <path
          fill="none"
          strokeWidth={1.6}
          d="M7.92 16.4v1.72M16.08 16.4v1.72"
        />
        <path fill="none" strokeWidth={1.15} d="M8.11 11.44h7.79" />
        <path fill="none" d="M1.88 18.12h20.25" />
      </g>
      <g fill="currentColor">
        <circle cx="8.59" cy="8.22" r="1.1" />
        <circle cx="15.41" cy="8.22" r="1.1" />
      </g>
    </svg>
  );
}
