import entries from "virtual:changelog-entries";
import type { ChangelogEntry } from "@frog/core";
import { type ReactNode, useEffect, useState } from "react";
import { getChangelogLastSeen, markChangelogSeen } from "@/lib/changelog-prefs";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});
const formatEntryDate = (date: string) =>
  dateFmt.format(new Date(`${date}T00:00:00Z`));

// Entries have no id; same-day entries are common (see docs/DECISIONS.md
// 2026-08-04), so key off date + title/body rather than array index.
const entryKey = (entry: ChangelogEntry) =>
  `${entry.date}-${entry.title ?? entry.body.slice(0, 32)}`;

// docs/DECISIONS.md entries use **bold**, `code`, and ~~strikethrough~~
// (SUPERSEDED markers) throughout — a light inline pass so the log reads
// cleanly here instead of showing literal asterisks/backticks.
const INLINE_RE = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`)/g;
function renderInline(text: string): ReactNode[] {
  return text.split(INLINE_RE).map((part, i) => {
    const key = `${i}-${part.slice(0, 12)}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("~~") && part.endsWith("~~")) {
      return (
        <s key={key} className="text-faint">
          {part.slice(2, -2)}
        </s>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded-sm bg-surface-2 px-1 text-2xs">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// Dev-facing changelog (docs/DECISIONS.md 2026-08-04): reads straight from
// the project's own decision log rather than git/GitHub tooling. `entries`
// (the parsed, already-sorted-newest-first array) comes from the
// `virtual:changelog-entries` module — see vite.config.ts's changelogPlugin.
export default function ChangelogScreen() {
  // Snapshot the marker BEFORE marking seen below, so this visit still shows
  // what was new *when it started* instead of the section vanishing the
  // instant the effect fires.
  const [cutoff] = useState(getChangelogLastSeen);

  useEffect(() => {
    const latest = entries[0]?.date;
    if (latest) markChangelogSeen(latest);
  }, []);

  const newEntries =
    cutoff != null ? entries.filter((e) => e.date > cutoff) : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Changelog</h1>
      <p className="mt-1 text-xs text-faint">
        Dev log of what shipped, pulled straight from docs/DECISIONS.md.
      </p>

      {entries.length === 0 ? (
        <p className="mt-6 px-4 py-6 text-center text-xs text-faint">
          Nothing logged yet.
        </p>
      ) : (
        <>
          {newEntries.length > 0 && (
            <>
              <h2 className="mt-6 text-2xs font-medium tracking-widest text-accent uppercase">
                New since your last visit
              </h2>
              <div
                className="mt-2 divide-y divide-border overflow-hidden border border-accent bg-surface"
                data-testid="changelog-new"
              >
                {newEntries.map((entry) => (
                  <EntryCard key={`new-${entryKey(entry)}`} entry={entry} />
                ))}
              </div>
            </>
          )}

          <h2 className="mt-6 text-2xs font-medium tracking-widest text-faint uppercase">
            All decisions
          </h2>
          <div
            className="mt-2 divide-y divide-border overflow-hidden border border-border bg-surface"
            data-testid="changelog-all"
          >
            {entries.map((entry, i) => (
              <EntryCard
                key={entryKey(entry)}
                entry={entry}
                testId={`changelog-entry-${i}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  testId,
}: {
  entry: ChangelogEntry;
  testId?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 px-4 py-3"
      data-testid={testId}
      data-date={entry.date}
    >
      <div className="flex items-center gap-2">
        <span className="num text-2xs font-medium text-faint">
          {formatEntryDate(entry.date)}
        </span>
        <span className="text-2xs font-medium tracking-widest text-faint uppercase">
          {entry.section}
        </span>
      </div>
      {entry.title && <h3 className="text-sm font-medium">{entry.title}</h3>}
      <p className="whitespace-pre-line text-xs text-ink-2">
        {renderInline(entry.body)}
      </p>
    </div>
  );
}
