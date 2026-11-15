// The frog-mascot "moment" (share canvas Instagram pass, 2026-08-08 —
// docs/DECISIONS.md): the canonical brand mark in a flat two-pose moment,
// drawn at the top-right of the card's brand row. The frog itself is always
// the SAME component the app uses everywhere, rasterized through
// loadFrogMarkImage — never a hand-copy of its paths (AGENTS.md "Brand mark";
// check-mark-drift.ts stays green because no canonical file changes). The
// prop is a barbell in the mark's flat line-work language (bar + plate rings
// + hub dots, `p.ink` — the same ink as the wordmark beside it), so the
// moment reads as a sticker of the frog itself, not a new drawing.
//
// Poses: "press" — the bar overhead, resting on the crown (the PR moment:
// pr/records cards); "ride" — the frog perched on the bar (session, streak,
// month, year, measurement). Both reuse one barbell; all numbers are
// fractions of the box so a pose scales with the slot (the caller sizes the
// box; the box is wide enough that the landscape mark's own 1.6:1 aspect
// always fits inside it). Tuned against the E2E_EVIDENCE_DIR PNGs, like every
// other painter value in this system.
import type { Palette } from "./grounds";
import { drawFrogMark, loadFrogMarkImage } from "./mark";

export type MascotPose = "press" | "ride";

export async function paintMascotMoment(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  p: Palette,
  pose: MascotPose,
): Promise<void> {
  try {
    const mark = await loadFrogMarkImage(p.ink, p.markBody);
    const { x, y, w, h } = box;

    const barX0 = x + w * 0.08;
    const barX1 = x + w * 0.92;
    const plateR = h * 0.15;
    const barW = Math.max(2, h * 0.045);

    const drawBarbell = (barY: number) => {
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = barW;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(barX0, barY);
      ctx.lineTo(barX1, barY);
      ctx.stroke();
      for (const cx of [barX0, barX1]) {
        ctx.beginPath();
        ctx.arc(cx, barY, plateR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = p.ink;
        ctx.beginPath();
        ctx.arc(cx, barY, h * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (pose === "press") {
      // The bar crosses the crown dip between the eye humps — drawn over the
      // mark so it reads as resting on the frog's head.
      const markH = h * 0.66;
      const markTop = y + h * 0.3;
      drawFrogMark(ctx, mark, x + (w - markH) / 2, markTop, markH);
      drawBarbell(markTop + h * 0.03);
    } else {
      // The frog's own ground bar overlaps the barbell bar — drawn over it so
      // the frog reads as perched on the bar.
      const barY = y + h * 0.64;
      drawBarbell(barY);
      const markH = h * 0.58;
      drawFrogMark(
        ctx,
        mark,
        x + (w - markH) / 2,
        barY + h * 0.03 - markH,
        markH,
      );
    }
  } catch {
    // The mark failed to rasterize — the brand row already fell back to the
    // wordmark; skip the mascot quietly rather than half-draw a moment.
  }
}
