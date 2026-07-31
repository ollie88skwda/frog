import type { CSSProperties } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { FrogMark } from "@/components/frog-mark";

// Rasterizes the SAME component the rest of the app uses for its brand mark
// — never a third hand-copy of the path geometry (AGENTS.md already flags
// two). Mounted into a detached host via the app's own react-dom/client
// (already loaded; react-dom/server would double the bundle for this one
// icon — AGENTS.md:83, ~61 kB gz measured) and read back with the native
// XMLSerializer. FrogMark's outline is `currentColor` and its body is
// `var(--accent)`; set both via inline style/custom-property so the
// serialized SVG (no access to the page's live CSS once standalone) resolves
// the requested palette. Moved verbatim from the pre-redesign share-card.tsx.

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
