import type { SVGProps } from "react";

/**
 * The rest stopwatch's own mark — a plain stopwatch ring, no pause bars (rest
 * is now an up-count, not a paused countdown). Hand-composed rather than
 * picked from lucide because lucide's own `Timer` already means something
 * else in this app — the *set-duration* stopwatch used by duration-type
 * exercises' own start/stop control — and reusing it for rest would collide
 * with that meaning.
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
    </svg>
  );
}
