// Click-to-comment: a dev-only annotation overlay. Point at anything in the
// running app, write a note, copy the lot as markdown for an agent.
//
// GENERIC BY CONSTRUCTION — do not "wire up" a screen to make it annotatable.
// Everything is resolved at the DOM level from the event target: the source
// location comes from the build-time `data-frog-src` stamp that
// apps/web/plugins/annotate-source.ts puts on every intrinsic JSX element, the
// component name from that stamp plus the React fiber tree, the rest from
// standard attributes. A screen written next year is annotatable the moment it
// renders, with zero new code here or there.
//
// Mounted once, dev-only, from app.tsx. Styling is inline on purpose: no CSS
// file, no Tailwind/Radix classes, so nothing about this tool can reach a
// production stylesheet, and nothing about the app's own CSS can distort it.

import { APP_NAME, newId } from "@frog/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SRC_ATTR, UI_ATTR } from "./attrs";
import {
  type AnnotationNote,
  type AnnotationTarget,
  formatNotes,
  formatSourceRef,
} from "./format";
import { describeElement } from "./identity";
import { loadNotes, saveNotes } from "./store";

/* Events that would otherwise reach the app. Captured on `document`, which
 * fires before React's root-container listener, so a button click annotates
 * instead of firing. Selection happens on `pointerdown` — the first event both
 * mouse and touch produce — and preventing its default is what suppresses the
 * compatibility click on touch. Touch events are only stopped, never
 * prevented, so the page still scrolls while the mode is on. */
const SWALLOWED = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "auxclick",
  "dblclick",
  "contextmenu",
  "touchstart",
  "touchend",
  "submit",
] as const;

const Z = 2147483000;
const INK = "#e8efe8";
const PANEL = "rgba(14,17,15,0.97)";
const LINE = "rgba(232,239,232,0.18)";
const ACCENT = "#5cb86c";

const uiMark: Record<string, string> = { [UI_ATTR]: "" };

/** The overlay's own chrome, which is never annotated and never suppressed. */
const isOurUi = (t: EventTarget | null) =>
  t instanceof Element && t.closest(`[${UI_ATTR}]`) !== null;

/** Somewhere a keystroke or a caret is meant to land — the one exemption from
 * the pointer and key suppression below, in either direction. */
const isTextEntry = (t: EventTarget | null) =>
  t instanceof HTMLInputElement ||
  t instanceof HTMLTextAreaElement ||
  t instanceof HTMLSelectElement ||
  (t instanceof HTMLElement && t.isContentEditable);

const panelBase: React.CSSProperties = {
  position: "fixed",
  left: "max(8px, env(safe-area-inset-left))",
  right: "max(8px, env(safe-area-inset-right))",
  bottom: "calc(8px + env(safe-area-inset-bottom))",
  margin: "0 auto",
  maxWidth: 560,
  background: PANEL,
  color: INK,
  border: `1px solid ${LINE}`,
  boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
  font: "13px/1.45 ui-sans-serif, system-ui, sans-serif",
  pointerEvents: "auto",
};

// Every control keeps a visible resting background (AGENTS.md: buttons are
// never bare text) and a ≥40px tap target on the touch path. The quiet/danger
// fills are OPAQUE, not translucent: the floating bar sits directly on the
// page, and a 12%-white wash left pale text unreadable over the light theme.
function btnStyle(kind: "primary" | "quiet" | "danger"): React.CSSProperties {
  const bg =
    kind === "primary" ? ACCENT : kind === "danger" ? "#4a221e" : "#242a25";
  return {
    minHeight: 40,
    padding: "0 12px",
    background: bg,
    color: kind === "primary" ? "#08120a" : INK,
    border: `1px solid ${kind === "primary" ? ACCENT : LINE}`,
    font: "inherit",
    fontWeight: 600,
    cursor: "pointer",
  };
}

type Spot = { rect: DOMRect; label: string };

function spotFor(el: Element): Spot {
  const src = el.closest(`[${SRC_ATTR}]`)?.getAttribute(SRC_ATTR) ?? null;
  const testId = el.closest("[data-testid]")?.getAttribute("data-testid");
  const parts = [el.tagName.toLowerCase()];
  if (testId) parts.push(testId);
  if (src) parts.push(src.slice(src.lastIndexOf("/") + 1));
  return { rect: el.getBoundingClientRect(), label: parts.join(" · ") };
}

function noteTitle(t: AnnotationTarget): string {
  return formatSourceRef(t) ?? t.testId ?? t.selector;
}

export default function AnnotateOverlay() {
  const [on, setOn] = useState(false);
  const [notes, setNotes] = useState<AnnotationNote[]>(loadNotes);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [pending, setPending] = useState<AnnotationTarget | null>(null);
  const [draft, setDraft] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [armClear, setArmClear] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const hoveredRef = useRef<Element | null>(null);
  const onRef = useRef(false);
  const pendingRef = useRef(false);
  const draftRef = useRef("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  onRef.current = on;
  pendingRef.current = pending !== null;
  draftRef.current = draft;

  useEffect(() => saveNotes(notes), [notes]);

  const markdown = useCallback(
    () =>
      formatNotes(notes, {
        appName: APP_NAME,
        capturedAt: Date.now(),
        origin: location.origin,
      }),
    [notes],
  );

  /* Bundle-gate marker AND the E2E hook, in one honest object: the overlay's
   * presence in a chunk is exactly `window.__frogAnnotate`, which
   * scripts/check-bundle.ts fails a production build over. */
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__frogAnnotate = { notes, markdown };
    return () => {
      delete w.__frogAnnotate;
    };
  }, [notes, markdown]);

  const setMode = useCallback((next: boolean) => {
    setOn(next);
    setStatus(null);
    if (!next) {
      setPending(null);
      setSpot(null);
      setListOpen(false);
      hoveredRef.current = null;
    }
  }, []);

  /* Toggle + escape. On `window` capture so it lands before both the app's
   * single-key hotkeys and the mode's own document-level suppression. A key
   * the overlay consumes stops dead there: the Escape that closes the composer
   * must not also dismiss the Radix layer underneath it. An Escape the overlay
   * has no use for — mode off, nothing pending — is left entirely alone. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.ctrlKey &&
        e.shiftKey &&
        !e.metaKey &&
        e.key.toLowerCase() === "a"
      ) {
        e.preventDefault();
        e.stopPropagation();
        setMode(!onRef.current);
        return;
      }
      if (e.key !== "Escape") return;
      if (!onRef.current && !pendingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (pendingRef.current) setPending(null);
      else setMode(false);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setMode]);

  /* The app never loses focus to this tool, and never learns about the focus
   * moves the tool makes for itself. Blur is load-bearing here — a session row
   * auto-commits its set when a field is left — and the overlay touches focus
   * constantly: entering the mode blurs the active element, the composer takes
   * it outright, and every tap on the chrome would take it too.
   *
   * Two listeners, both alive whether the mode is on or off, because the
   * floating toggle is tappable with the mode still off:
   *  - Pointer focus is refused at the source, for every pixel of the chrome
   *    that is not text entry — not just its buttons. A tap on panel padding,
   *    a note's source line or its comment drops focus to the document just as
   *    surely, and in every engine, since a non-focusable <div> never becomes
   *    a `relatedTarget` the guard below could recognise. (Chrome does focus a
   *    <button> on click and WebKit/Gecko do not, so the buttons were only ever
   *    half-covered either way.) The cost, taken deliberately: a note's text in
   *    the list can no longer be drag-selected — Copy all is the way out, and
   *    Edit still gives a real textarea with a caret and selection.
   *  - What focus moves remain (the mode's own blur, the composer, a Tab into
   *    the chrome) are stopped at document capture, before React's delegated
   *    listener on the #root container below can see them. */
  useEffect(() => {
    function holdFocus(e: MouseEvent) {
      if (isOurUi(e.target) && !isTextEntry(e.target)) e.preventDefault();
    }
    function guardFocus(e: FocusEvent) {
      if (isOurUi(e.target)) return;
      if (onRef.current || isOurUi(e.relatedTarget)) e.stopPropagation();
    }
    document.addEventListener("mousedown", holdFocus, true);
    document.addEventListener("focusout", guardFocus, true);
    return () => {
      document.removeEventListener("mousedown", holdFocus, true);
      document.removeEventListener("focusout", guardFocus, true);
    };
  }, []);

  /* Crosshair + no text selection while picking. */
  useEffect(() => {
    if (!on) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const html = document.documentElement;
    const cursor = html.style.cursor;
    const select = html.style.userSelect;
    html.style.cursor = "crosshair";
    html.style.userSelect = "none";
    return () => {
      html.style.cursor = cursor;
      html.style.userSelect = select;
    };
  }, [on]);

  /* The whole interception, in one effect. Nothing here names a component. */
  useEffect(() => {
    if (!on) return;

    function onMove(e: PointerEvent) {
      if (pendingRef.current) return;
      const t = e.target;
      if (!(t instanceof Element) || isOurUi(t) || t === hoveredRef.current)
        return;
      hoveredRef.current = t;
      setSpot(spotFor(t));
    }

    function swallow(e: Event) {
      if (isOurUi(e.target)) return;
      e.stopPropagation();
      if (e.cancelable && e.type !== "touchstart" && e.type !== "touchend")
        e.preventDefault();
      if (e.type !== "pointerdown" || !(e.target instanceof Element)) return;
      // A composer with text in it is not thrown away by a stray tap.
      if (pendingRef.current && draftRef.current.trim()) return;
      const el = e.target;
      hoveredRef.current = el;
      setSpot(spotFor(el));
      setPending(describeElement(el));
      setDraft("");
      setListOpen(false);
      setStatus(null);
    }

    /* App single-key hotkeys (s/l/h/f) must not fire while annotating. Only
     * propagation is stopped when nothing editable holds focus, so the arrow /
     * space / page keys still scroll the page — the same bargain the touch
     * events strike above. */
    function muteKeys(e: KeyboardEvent) {
      if (isOurUi(e.target) || e.key === "Escape") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.stopPropagation();
      if (isTextEntry(e.target)) e.preventDefault();
    }

    function refresh() {
      const el = hoveredRef.current;
      setSpot(el?.isConnected ? spotFor(el) : null);
    }

    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("keydown", muteKeys, true);
    for (const type of SWALLOWED)
      document.addEventListener(type, swallow, true);
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    return () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("keydown", muteKeys, true);
      for (const type of SWALLOWED)
        document.removeEventListener(type, swallow, true);
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
    };
  }, [on]);

  useEffect(() => {
    if (pending) composerRef.current?.focus();
  }, [pending]);

  function saveNote() {
    if (!pending) return;
    const comment = draft.trim();
    if (!comment) return;
    setNotes((prev) => [
      ...prev,
      {
        id: newId(),
        comment,
        createdAt: Date.now(),
        target: pending,
      },
    ]);
    setPending(null);
    setDraft("");
    setStatus("Note added");
  }

  async function copyAll() {
    const md = markdown();
    try {
      await navigator.clipboard.writeText(md);
      setStatus(`Copied ${notes.length} note${notes.length === 1 ? "" : "s"}`);
    } catch {
      // Dev fallback: the payload is never lost, just not on the clipboard.
      console.log(md);
      setStatus("Clipboard blocked — payload logged to console");
    }
  }

  const showBar = !pending;
  /* The floating control collapses to a single small chip when idle (mode off
   * and nothing to review) — a 40×40 button at bottom-left clears every app
   * control that lives there (e.g. the finish sheet's Discard, whose click
   * center sits ~60px from the left edge); the two-button bar it expands to
   * would cover it. The full bar shows while the mode is on, notes exist, or
   * the list is open. Colliding corners are a moving target across screens,
   * so the rule is: smallest footprint that still does the job. */
  const showFullBar = on || notes.length > 0 || listOpen;
  // Clamped on both axes: a label on a right-edge control used to run off the
  // viewport, which is exactly the clipping the mobile-first rule forbids.
  const labelLeft = spot
    ? Math.max(4, Math.min(spot.rect.left, window.innerWidth - 140))
    : 0;

  return createPortal(
    <div
      {...uiMark}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z,
        pointerEvents: "none",
      }}
    >
      {on && spot && (
        <>
          <div
            data-testid="annotate-highlight"
            style={{
              position: "fixed",
              left: spot.rect.left,
              top: spot.rect.top,
              width: spot.rect.width,
              height: spot.rect.height,
              outline: `2px solid ${ACCENT}`,
              outlineOffset: 1,
              background: "rgba(92,184,108,0.14)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "fixed",
              left: labelLeft,
              top:
                spot.rect.top > 26 ? spot.rect.top - 24 : spot.rect.bottom + 4,
              maxWidth: window.innerWidth - labelLeft - 4,
              padding: "2px 6px",
              background: ACCENT,
              color: "#08120a",
              font: "600 11px/1.6 ui-monospace, SFMono-Regular, monospace",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              pointerEvents: "none",
            }}
          >
            {spot.label}
          </div>
        </>
      )}

      {showBar && !showFullBar && (
        <div
          style={{
            position: "fixed",
            left: "max(8px, env(safe-area-inset-left))",
            bottom: "calc(8px + env(safe-area-inset-bottom))",
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            data-testid="annotate-toggle"
            aria-pressed={on}
            title="Toggle annotation mode (Ctrl+Shift+A)"
            onClick={() => setMode(true)}
            style={{
              ...btnStyle("quiet"),
              width: 40,
              padding: 0,
              fontSize: 16,
              backdropFilter: "blur(6px)",
            }}
          >
            ◎
          </button>
        </div>
      )}

      {showBar && showFullBar && (
        <div
          style={{
            position: "fixed",
            left: "max(8px, env(safe-area-inset-left))",
            bottom: "calc(8px + env(safe-area-inset-bottom))",
            display: "flex",
            gap: 6,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            data-testid="annotate-toggle"
            aria-pressed={on}
            title="Toggle annotation mode (Ctrl+Shift+A)"
            onClick={() => setMode(!on)}
            style={{
              ...btnStyle(on ? "primary" : "quiet"),
              backdropFilter: "blur(6px)",
            }}
          >
            {on ? "◉ Annotating" : "◎ Annotate"}
          </button>
          <button
            type="button"
            data-testid="annotate-list-btn"
            onClick={() => {
              setListOpen((v) => !v);
              setArmClear(false);
            }}
            style={{ ...btnStyle("quiet"), backdropFilter: "blur(6px)" }}
          >
            {notes.length} note{notes.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {pending && (
        <div data-testid="annotate-composer" style={panelBase}>
          <div
            style={{
              padding: "8px 10px",
              borderBottom: `1px solid ${LINE}`,
              font: "11px/1.5 ui-monospace, SFMono-Regular, monospace",
              color: "rgba(232,239,232,0.75)",
              overflowWrap: "anywhere",
            }}
            data-testid="annotate-composer-target"
          >
            {noteTitle(pending)}
          </div>
          <textarea
            ref={composerRef}
            data-testid="annotate-comment"
            value={draft}
            placeholder="What's wrong with this?"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote();
            }}
            rows={3}
            style={{
              display: "block",
              width: "100%",
              padding: 10,
              background: "transparent",
              color: INK,
              border: "none",
              outline: "none",
              font: "inherit",
              resize: "vertical",
            }}
          />
          <div
            style={{
              display: "flex",
              gap: 6,
              justifyContent: "flex-end",
              padding: 8,
              borderTop: `1px solid ${LINE}`,
            }}
          >
            <button
              type="button"
              data-testid="annotate-cancel"
              onClick={() => setPending(null)}
              style={btnStyle("quiet")}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="annotate-save"
              onClick={saveNote}
              disabled={!draft.trim()}
              style={{
                ...btnStyle("primary"),
                opacity: draft.trim() ? 1 : 0.5,
              }}
            >
              Add note
            </button>
          </div>
        </div>
      )}

      {listOpen && !pending && (
        <div
          data-testid="annotate-list"
          style={{
            ...panelBase,
            bottom: "calc(56px + env(safe-area-inset-bottom))",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "8px 10px",
              borderBottom: `1px solid ${LINE}`,
              fontWeight: 700,
            }}
          >
            <span>
              {notes.length} note{notes.length === 1 ? "" : "s"}
            </span>
            {status && (
              <span
                data-testid="annotate-status"
                style={{ fontWeight: 400, color: ACCENT }}
              >
                {status}
              </span>
            )}
          </div>

          <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
            {notes.length === 0 && (
              <p style={{ margin: 0, padding: 12, opacity: 0.7 }}>
                Turn annotation mode on, then tap anything.
              </p>
            )}
            {notes.map((n, i) => (
              <div
                key={n.id}
                data-testid={`annotate-note-${i}`}
                style={{ padding: 10, borderBottom: `1px solid ${LINE}` }}
              >
                <div
                  style={{
                    font: "11px/1.5 ui-monospace, SFMono-Regular, monospace",
                    color: "rgba(232,239,232,0.7)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {i + 1}. {noteTitle(n.target)}
                </div>
                {editingId === n.id ? (
                  <>
                    <textarea
                      data-testid={`annotate-note-${i}-input`}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      style={{
                        display: "block",
                        width: "100%",
                        margin: "6px 0",
                        padding: 8,
                        background: "rgba(232,239,232,0.06)",
                        color: INK,
                        border: `1px solid ${LINE}`,
                        font: "inherit",
                        resize: "vertical",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        data-testid={`annotate-note-${i}-save`}
                        onClick={() => {
                          const comment = editDraft.trim();
                          if (!comment) return;
                          setNotes((prev) =>
                            prev.map((p) =>
                              p.id === n.id ? { ...p, comment } : p,
                            ),
                          );
                          setEditingId(null);
                        }}
                        style={btnStyle("primary")}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        style={btnStyle("quiet")}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ margin: "4px 0 8px", whiteSpace: "pre-wrap" }}>
                      {n.comment}
                    </p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        data-testid={`annotate-note-${i}-edit`}
                        onClick={() => {
                          setEditingId(n.id);
                          setEditDraft(n.comment);
                        }}
                        style={btnStyle("quiet")}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        data-testid={`annotate-note-${i}-delete`}
                        onClick={() =>
                          setNotes((prev) => prev.filter((p) => p.id !== n.id))
                        }
                        style={btnStyle("danger")}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              justifyContent: "space-between",
              padding: 8,
              borderTop: `1px solid ${LINE}`,
            }}
          >
            <button
              type="button"
              data-testid="annotate-copy"
              onClick={() => void copyAll()}
              disabled={notes.length === 0}
              style={{
                ...btnStyle("primary"),
                opacity: notes.length ? 1 : 0.5,
              }}
            >
              Copy all
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              {armClear ? (
                <button
                  type="button"
                  data-testid="annotate-clear-confirm"
                  onClick={() => {
                    setNotes([]);
                    setArmClear(false);
                    setStatus("Cleared");
                  }}
                  style={btnStyle("danger")}
                >
                  Confirm clear
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="annotate-clear"
                  onClick={() => setArmClear(true)}
                  disabled={notes.length === 0}
                  style={{
                    ...btnStyle("danger"),
                    opacity: notes.length ? 1 : 0.5,
                  }}
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                data-testid="annotate-close"
                onClick={() => setListOpen(false)}
                style={btnStyle("quiet")}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
