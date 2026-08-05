// Dev-facing changelog: parses docs/DECISIONS.md's own dated bullet log
// rather than standing up separate git-log or GitHub-API tooling (see
// docs/DECISIONS.md's own header for the format this depends on). Vite plugin
// hook is apps/web/vite.config.ts; the nav badge + /changelog screen consume
// its output via the `virtual:changelog-*` modules it exposes.

export type ChangelogEntry = {
  date: string; // YYYY-MM-DD
  title: string | null;
  section: string;
  body: string;
  line: number; // 1-based source line of the bullet — the only stable id
};

// Matches a top-level entry bullet, e.g.:
//   - **2026-08-04** — Terse summary.
//   - **2026-08-04 (custom exercise adder)** — Terse summary.
const ENTRY_RE =
  /^- \*\*(\d{4}-\d{2}-\d{2})(?:\s*\(([^)]+)\))?\*\*\s*—\s*(.*)$/;
const HEADING_RE = /^## (.+)$/;

/** Parses the dated bullet log into structured entries, newest first (ties
 * keep file order). Only top-level `- **YYYY-MM-DD** — …` bullets count as
 * entries: indented continuation lines fold into the entry above them, and a
 * heading with no such bullets under it (e.g. the Backlog checklist) simply
 * contributes nothing, since nothing there matches the entry pattern. */
export function parseDecisionsLog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let section = "";
  let current: ChangelogEntry | null = null;

  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(HEADING_RE);
    if (heading) {
      section = heading[1].trim();
      current = null;
      continue;
    }
    const match = line.match(ENTRY_RE);
    if (match) {
      current = {
        date: match[1],
        title: match[2] ?? null,
        section,
        body: match[3].trim(),
        line: i + 1,
      };
      entries.push(current);
      continue;
    }
    if (current && line.trim().length > 0) {
      current.body += `\n${line.trim()}`;
    }
  }

  return entries.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
}
