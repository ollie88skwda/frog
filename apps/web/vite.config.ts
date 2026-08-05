import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { parseDecisionsLog } from "../../packages/core/src/domain/changelog";

// docs/DECISIONS.md is the dev changelog's one content source (see
// docs/DECISIONS.md 2026-08-04, changelog page). Two virtual modules so the
// nav badge (eager) never pulls in the full parsed log (a lazy-route-only
// cost): `virtual:changelog-latest` is a few bytes (just the newest date),
// `virtual:changelog-entries` is the full parsed array, imported only by the
// lazy /changelog screen.
const DECISIONS_PATH = fileURLToPath(
  new URL("../../docs/DECISIONS.md", import.meta.url),
);
const LATEST_ID = "virtual:changelog-latest";
const ENTRIES_ID = "virtual:changelog-entries";
const RESOLVED_LATEST = `\0${LATEST_ID}`;
const RESOLVED_ENTRIES = `\0${ENTRIES_ID}`;

function changelogPlugin(): Plugin {
  return {
    name: "frog-changelog",
    resolveId(id) {
      if (id === LATEST_ID) return RESOLVED_LATEST;
      if (id === ENTRIES_ID) return RESOLVED_ENTRIES;
      return undefined;
    },
    load(id) {
      if (id !== RESOLVED_LATEST && id !== RESOLVED_ENTRIES) return undefined;
      this.addWatchFile(DECISIONS_PATH);
      const entries = parseDecisionsLog(readFileSync(DECISIONS_PATH, "utf8"));
      if (id === RESOLVED_LATEST) {
        return `export const latestChangelogDate = ${JSON.stringify(entries[0]?.date ?? null)};`;
      }
      return `export default ${JSON.stringify(entries)};`;
    },
    // Dev-only: docs/DECISIONS.md changes on nearly every feature commit, so
    // reflect an edit without a manual server restart.
    configureServer(server) {
      server.watcher.add(DECISIONS_PATH);
      server.watcher.on("change", (file) => {
        if (file !== DECISIONS_PATH) return;
        for (const id of [RESOLVED_LATEST, RESOLVED_ENTRIES]) {
          const mod = server.moduleGraph.getModuleById(id);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), changelogPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
