import type { CSSProperties } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { FrogMark } from "@/components/frog-mark";

// Rasterizes the SAME component the rest of the app uses for its brand mark
// — never another hand-copy of the path geometry (AGENTS.md "Brand mark"
// tracks the copies that do exist). Mounted into a detached host via the
// app's own react-dom/client (already loaded; react-dom/server would double
// the bundle for this one icon — ~61 kB gz measured) and read back with the
// native XMLSerializer. Moved verbatim from the pre-redesign share-card.tsx.
//
// `outline` and `accent` are now BOTH inert for FrogMark itself — every
// fill layer (outline/eyes/nostrils/mouth, body, glints) is a fixed hex
// reproducing apps/web/public/icon.svg (`docs/DECISIONS.md`, the in-app
// dark-theme-outline decision, extended to the body/glints so the in-app
// mark stops following `--accent`). Both params are kept as cache-key
// inputs and still set on the host (`color` / `--accent`) in case a future
// FrogMark variant reads them again — left as-is rather than ripped out,
// since removing them would mean re-plumbing every call site with no
// behavior change. **Not re-verified against the
// Photo ground specifically**: that ground previously forced the outline to
// white for guaranteed contrast against an arbitrary, un-scrimmed photo (the
// scrim `paint.ts` draws only darkens the card's bottom 55%, not the header
// row this mark sits in) and now gets the same fixed navy as every other
// ground — fine against the Green/Light/Dark grounds' own always-known
// backgrounds (the in-app decision's A/B/C/D comparison covers Dark), but a
// sufficiently dark or busy Photo background could still wash a navy outline
// out where white was chosen deliberately. Flagged, not fixed here.

const markImageCache = new Map<string, HTMLImageElement>();

export function loadFrogMarkImage(
  outline: string,
  accent: string,
): Promise<HTMLImageElement> {
  const key = `${outline}|${accent}`;
  const cached = markImageCache.get(key);
  if (cached) return Promise.resolve(cached);

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-9999px";
  document.body.appendChild(host);
  const root = createRoot(host);
  const style = { color: outline, "--accent": accent } as CSSProperties;
  flushSync(() => root.render(<FrogMark style={style} />));
  const svgEl = host.querySelector("svg");
  // FrogMark declares only a viewBox, so on its own an <img> of it has an
  // intrinsic ratio but no intrinsic size. Stamp width/height off the viewBox
  // so the raster carries the mark's real proportions and `drawFrogMark` can
  // read them back — the mark is landscape, and every canvas slot is square.
  if (svgEl) {
    const [, , vbW, vbH] = (svgEl.getAttribute("viewBox") ?? "")
      .split(/[\s,]+/)
      .map(Number);
    if (vbW > 0 && vbH > 0) {
      svgEl.setAttribute("width", String(vbW));
      svgEl.setAttribute("height", String(vbH));
    }
  }
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

/**
 * Paints the mark into a square `size` slot the way icon.svg's tile does:
 * scaled to fit on its longer axis and centred on the shorter one. `drawImage`
 * fills whatever destination rect it is handed, so a square rect would stretch
 * the landscape mark — never hand it one directly.
 */
export function drawFrogMark(
  ctx: CanvasRenderingContext2D,
  mark: HTMLImageElement,
  x: number,
  y: number,
  size: number,
) {
  const w = mark.naturalWidth || size;
  const h = mark.naturalHeight || size;
  const scale = size / Math.max(w, h);
  const drawW = w * scale;
  const drawH = h * scale;
  ctx.drawImage(
    mark,
    x + (size - drawW) / 2,
    y + (size - drawH) / 2,
    drawW,
    drawH,
  );
}
