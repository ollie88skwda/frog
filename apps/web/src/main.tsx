import { IconContext } from "@phosphor-icons/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { MotionProvider } from "./lib/motion";
import "./lib/test-hooks";
import { registerServiceWorker } from "./lib/pwa";
import "./styles/theme.css";
import "./components/ui/input-focus.css";
import { installSelectOnFocus } from "./components/ui/select-on-focus";

installSelectOnFocus();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <IconContext.Provider value={{ "aria-hidden": true }}>
      <MotionProvider>
        <App />
      </MotionProvider>
    </IconContext.Provider>
  </StrictMode>,
);

// PWA app-shell cache. Prod only (dev has no built assets to cache); skipped in
// E2E builds so Playwright never races a caching layer over a fresh preview.
if (import.meta.env.PROD && !import.meta.env.VITE_E2E) {
  registerServiceWorker();
}
