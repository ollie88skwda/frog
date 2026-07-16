import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./lib/test-hooks";
import { registerServiceWorker } from "./lib/pwa";
import "./styles/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA app-shell cache. Prod only (dev has no built assets to cache); skipped in
// E2E builds so Playwright never races a caching layer over a fresh preview.
if (import.meta.env.PROD && !import.meta.env.VITE_E2E) {
  registerServiceWorker();
}
