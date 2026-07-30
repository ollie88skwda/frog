import type { SVGProps } from "react";

/**
 * The rest timer's own mark — a stopwatch ring with a pause glyph inside
 * ("time the pause"). Hand-composed rather than picked from lucide so the rest
 * timer doesn't share a glyph with anything else on the session screen: lucide's
 * `Timer` is the *set* duration stopwatch and `Pause` is the session pause, and
 * the whole point of this control is that it reads as its own feature.
 *
 * Drawn in lucide's grammar (24-unit box, 2px round strokes, `currentColor`) so
 * it sits in the same family as every other icon in the app. Vector + inline for
 * the 220 kB bundle gate — no new dependency.
 */
export function RestTimerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* Stopwatch crown + stem. */}
      <path d="M9 2h6" />
      <path d="M12 2v3" />
      {/* Dial. */}
      <circle cx="12" cy="13" r="8" />
      {/* Pause bars — rest, not elapsed time. */}
      <path d="M10 10v6" />
      <path d="M14 10v6" />
    </svg>
  );
}
