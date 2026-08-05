import { describe, expect, it } from "vitest";
import { parseDecisionsLog } from "./changelog";

describe("parseDecisionsLog", () => {
  it("parses a plain entry: date, section, body", () => {
    const md = `# DECISIONS.md\n\n## Product\n\n- **2026-01-01** — First decision.\n`;
    const entries = parseDecisionsLog(md);
    expect(entries).toEqual([
      {
        date: "2026-01-01",
        title: null,
        section: "Product",
        body: "First decision.",
      },
    ]);
  });

  it("parses a titled entry: date (title) — body", () => {
    const md = `## Design\n\n- **2026-02-03 (rest stopwatch)** — Narrows the trigger.\n`;
    const entries = parseDecisionsLog(md);
    expect(entries[0]).toEqual({
      date: "2026-02-03",
      title: "rest stopwatch",
      section: "Design",
      body: "Narrows the trigger.",
    });
  });

  it("folds indented continuation lines into the entry's body", () => {
    const md = [
      "## Product",
      "",
      "- **2026-03-01 (custom exercise adder)** — Users can create exercises.",
      "  **Extend `exercises`, no new table.** Nullable columns.",
      "  **Muscle role, not just array order.** Second detail.",
      "- **2026-03-02** — Next entry starts a fresh bullet.",
    ].join("\n");
    const entries = parseDecisionsLog(md);
    expect(entries).toHaveLength(2);
    expect(entries[1].body).toBe(
      [
        "Users can create exercises.",
        "**Extend `exercises`, no new table.** Nullable columns.",
        "**Muscle role, not just array order.** Second detail.",
      ].join("\n"),
    );
    expect(entries[0].body).toBe("Next entry starts a fresh bullet.");
  });

  it("ignores content under headings with no dated bullets (e.g. a backlog checklist)", () => {
    const md = [
      "## Product",
      "- **2026-01-01** — Real decision.",
      "## Backlog — lesson content",
      "- [ ] `rpe` — ______ (some placeholder line)",
      "- [ ] `rest-between-sets` — ______",
    ].join("\n");
    const entries = parseDecisionsLog(md);
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toBe("Real decision.");
  });

  it("sorts newest first, keeping file order for ties", () => {
    const md = [
      "## Product",
      "- **2026-01-01** — Oldest.",
      "- **2026-03-01** — Newest.",
      "- **2026-02-01** — Middle.",
      "- **2026-02-01 (same day, second)** — Middle, second entry.",
    ].join("\n");
    const entries = parseDecisionsLog(md);
    expect(entries.map((e) => e.date)).toEqual([
      "2026-03-01",
      "2026-02-01",
      "2026-02-01",
      "2026-01-01",
    ]);
    // Same-day entries keep their original relative order (stable sort).
    expect(entries[1].body).toBe("Middle.");
    expect(entries[2].body).toBe("Middle, second entry.");
  });

  it("returns an empty array for a log with no dated entries", () => {
    expect(
      parseDecisionsLog("# DECISIONS.md\n\nJust prose, no bullets.\n"),
    ).toEqual([]);
  });
});
