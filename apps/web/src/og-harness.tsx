// Headless harness for scripts/gen-og-image.ts — NOT part of the shipped
// app. Not reachable from any route or import in the real app; only served
// when the OG generator points a browser at og-harness.html directly (Vite's
// build entry stays index.html-only, so this never lands in dist/). Paints
// the exact same static-brand OG image the app would via `paintBrandOg`,
// then flags completion on `window` for the generator script to poll.

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { paintBrandOg } from "./lib/share/paint";
import "./styles/theme.css";

declare global {
  interface Window {
    __ogReady?: boolean;
    __ogError?: string;
  }
}

function Harness() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    (async () => {
      try {
        if (ref.current) await paintBrandOg(ref.current);
        window.__ogReady = true;
      } catch (e) {
        window.__ogError = e instanceof Error ? e.message : String(e);
      }
    })();
  }, []);
  return <canvas id="og-canvas" ref={ref} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(<Harness />);
