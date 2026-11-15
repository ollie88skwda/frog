// Pure serialization for the dev click-to-comment overlay. No DOM, no React —
// everything here is unit-tested in format.test.ts. The output is what lands on
// the clipboard and gets pasted into a chat with an agent, so it is optimised
// for "find this element in the source and change it", not for human prose.

export type AnnotationTarget = {
  /** Repo-relative path of the JSX that rendered the nearest stamped ancestor
   * of the clicked node (`data-frog-src`), or null when unavailable. */
  file: string | null;
  line: number | null;
  column: number | null;
  /** True when the clicked node itself carried the stamp (rather than an
   * ancestor) — i.e. the source location is exact, not approximate. */
  exact: boolean;
  /** Component that owns the stamped JSX (`data-frog-cmp`). */
  ownerComponent: string | null;
  /** Nearest React component rendering the clicked node, from the fiber tree.
   * Unavailable in minified builds — the stamp is the reliable field. */
  nearestComponent: string | null;
  tag: string;
  testId: string | null;
  ariaLabel: string | null;
  role: string | null;
  selector: string;
  text: string | null;
  route: string;
  url: string;
  viewport: { w: number; h: number };
};

export type AnnotationNote = {
  id: string;
  comment: string;
  createdAt: number;
  target: AnnotationTarget;
};

export type CopyMeta = {
  appName: string;
  capturedAt: number;
  origin: string;
};

export const TEXT_LIMIT = 140;

/** Collapse whitespace and cut to `limit` graphemes-ish, with an ellipsis.
 * Returns null for anything that carries no signal. */
export function truncateText(
  raw: string | null | undefined,
  limit = TEXT_LIMIT,
): string | null {
  const flat = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

/** `file:line:col`, degrading to `file:line` then `file` as precision runs out. */
export function formatSourceRef(t: AnnotationTarget): string | null {
  if (!t.file) return null;
  if (t.line == null) return t.file;
  return t.column == null
    ? `${t.file}:${t.line}`
    : `${t.file}:${t.line}:${t.column}`;
}

function componentLabel(t: AnnotationTarget): string | null {
  const nearest =
    t.nearestComponent && t.nearestComponent !== t.ownerComponent
      ? t.nearestComponent
      : null;
  if (nearest && t.ownerComponent) return `${nearest} (in ${t.ownerComponent})`;
  return nearest ?? t.ownerComponent;
}

function heading(index: number, t: AnnotationTarget): string {
  const what = t.text ? `<${t.tag}> "${t.text}"` : `<${t.tag}>`;
  return `## ${index}. ${what}`;
}

function bullets(t: AnnotationTarget): string[] {
  const src = formatSourceRef(t);
  const rows: Array<[string, string | null]> = [
    [
      "Source",
      src && (t.exact ? src : `${src} (nearest JSX ancestor of the click)`),
    ],
    ["Component", componentLabel(t)],
    ["Test id", t.testId && `\`${t.testId}\``],
    ["Aria label", t.ariaLabel],
    ["Role", t.role],
    ["Selector", `\`${t.selector}\``],
    ["Route", `\`${t.route}\``],
    ["Viewport", `${t.viewport.w}×${t.viewport.h}`],
  ];
  return rows
    .filter((r): r is [string, string] => Boolean(r[1]))
    .map(([k, v]) => `- ${k}: ${v}`);
}

/** The clipboard payload: a short header plus one section per note, in capture
 * order (never re-sorted — the order the captain walked the screen is itself
 * information). */
export function formatNotes(
  notes: readonly AnnotationNote[],
  meta: CopyMeta,
): string {
  const count = `${notes.length} note${notes.length === 1 ? "" : "s"}`;
  const head = [
    `# ${meta.appName} UI feedback — ${count}`,
    `Captured ${new Date(meta.capturedAt).toISOString()} · ${meta.origin}`,
    "",
    "Each note points at one element in the running app. `Source` is the JSX",
    "that rendered it — start there.",
  ];
  if (notes.length === 0)
    return [...head, "", "_No notes captured._", ""].join("\n");

  const body = notes.map((n, i) =>
    [
      heading(i + 1, n.target),
      ...bullets(n.target),
      "",
      n.comment.trim() || "_(no comment)_",
    ].join("\n"),
  );
  return [...head, "", body.join("\n\n"), ""].join("\n");
}
