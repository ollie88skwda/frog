import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// The frog brand mark as in-app chrome (docs/brand/frog-brand-identity.html).
// This is the simplified cut of public/icon.svg: at the 20-32px it renders at,
// the haunches, nostrils and eye glints collapse into mud, so they are dropped
// and the surviving strokes carry the mark. Geometry is the same silhouette —
// the body path is icon.svg's, mapped from the tile's 572x355.5 art space into
// a 24-unit icon box (x * 0.0370879, centred) — so a change there has to be
// re-mapped here. The strokes are then ~1.35x the scaled weight: at 24px the
// true weight falls under a pixel and greys out. Do not push them further — at
// 1.75x the eye humps close over the eyes and the crown between them fills in.
//
// Theme-transparent on purpose — outline currentColor, body var(--accent).
// The app ships light and dark (set before first paint), and a hardcoded dark
// outline would vanish against the dark sage surface. This is the one place the
// mark is NOT the tile's fixed black-on-green: the tile owns its palette, the
// app chrome follows the theme. Never swap this for a raster: it is ~1.3 kB
// inline against 5-20 kB, and the bundle is CI-gated.
export function FrogMark({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      style={style}
    >
      <g
        fill="var(--accent)"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Body: left flank, left eye hump, the low crown between them, right hump, right flank. */}
        <path d="M5.32 18.11C5.32 17.42 4.81 16.31 4.68 15.5C4.39 13.76 4.87 12.01 5.89 10.6C6.68 9.51 7.94 8.89 8.15 8.62C8.32 8.41 8.22 7.9 8.3 7.63C8.51 6.88 9.12 6.22 9.89 6.01C10.53 5.83 11.24 5.9 11.81 6.25C12.03 6.39 12.53 6.95 12.74 6.92C13.27 6.83 13.58 6.56 14.23 6.59C14.51 6.61 15.43 6.93 15.56 6.9C15.75 6.86 16.15 6.35 16.38 6.21C17.33 5.62 18.62 5.92 19.27 6.82C20.11 7.99 19.32 8.76 19.35 9.3C19.37 9.71 19.55 10.13 19.62 10.53C19.79 11.56 19.85 12.59 19.79 13.64C19.74 14.51 19.57 15.4 19.34 16.24C19.16 16.86 18.82 17.46 18.82 18.11Z" />
        {/* Front feet, mouth, then the ground bar the frog sits on. */}
        <path fill="none" d="M7.86 16.24v1.87M16.01 16.24v1.87" />
        <path fill="none" strokeWidth={0.95} d="M9.98 11.43h7.79" />
        <path fill="none" d="M1.87 18.11h20.25" />
      </g>
      <g fill="currentColor">
        <circle cx="10.54" cy="8.21" r="1.12" />
        <circle cx="17.4" cy="8.21" r="1.12" />
      </g>
    </svg>
  );
}
