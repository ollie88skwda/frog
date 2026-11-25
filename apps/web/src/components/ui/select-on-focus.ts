// Select-on-focus for numeric fields, app-wide.
//
// Tapping a weight/reps box should let the next keystroke *replace* the number,
// not append to it or land mid-number (boss UX batch 2026-11-25). The logging
// path's big numeric inputs are bare <input>s owned by their screens, so this
// is one document-level listener keyed off the element itself rather than a
// prop every call site has to remember: any input whose `inputMode` is
// `numeric`/`decimal` (or `type="number"`) selects its whole value when it
// gains focus. Text fields (names, notes, search) are untouched.
//
// Opt out per element with `data-select-on-focus="off"`. Read-only fields
// (a running timer) are skipped.
//
// Why the deferral: on touch (iOS Safari, Chrome Android) the tap that focuses
// the field places the caret *after* `focus` fires, which would immediately
// collapse a selection made synchronously. Re-applying it on the next frame,
// and swallowing the focusing tap's own mouseup, keeps the whole value
// selected. A second tap on an already-focused field is left alone so the
// user can still drop the caret where they want.

const NUMERIC_MODES = new Set(["numeric", "decimal"]);

export function isSelectOnFocusTarget(
  el: EventTarget | null,
): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.readOnly || el.disabled) return false;
  if (el.dataset.selectOnFocus === "off") return false;
  return el.type === "number" || NUMERIC_MODES.has(el.inputMode);
}

function selectAll(el: HTMLInputElement) {
  if (el.ownerDocument.activeElement !== el || el.value === "") return;
  try {
    // setSelectionRange is the call iOS honours for programmatic selection.
    el.setSelectionRange(0, el.value.length);
  } catch {
    // type="number" has no selection API in some engines; select() still works.
    el.select();
  }
}

let installed = false;

/** Installs the listener once; safe to call repeatedly. Returns an uninstaller
 * (used by tests). */
export function installSelectOnFocus(doc: Document = document): () => void {
  if (installed) return () => {};
  installed = true;
  // The input that the current pointer press is focusing, if any: that
  // press's trailing mouseup would otherwise collapse the selection to a caret.
  // A press on an already-focused field is not recorded, so it still places
  // the caret normally.
  let pressFocusing: HTMLInputElement | null = null;

  const onPointerDown = (e: PointerEvent) => {
    const el = e.target;
    pressFocusing =
      isSelectOnFocusTarget(el) && doc.activeElement !== el ? el : null;
  };
  const onFocusIn = (e: FocusEvent) => {
    const el = e.target;
    if (!isSelectOnFocusTarget(el)) return;
    selectAll(el);
    // Re-apply only while the value is untouched: a fast first keystroke must
    // never be selected (and then overwritten by the second).
    const initial = el.value;
    const again = () => {
      if (el.value === initial) selectAll(el);
    };
    requestAnimationFrame(() => {
      again();
      // Touch engines may place the caret one frame later still.
      setTimeout(again, 0);
    });
  };
  const onMouseUp = (e: MouseEvent) => {
    if (pressFocusing && e.target === pressFocusing) {
      e.preventDefault();
      selectAll(pressFocusing);
    }
    pressFocusing = null;
  };

  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("focusin", onFocusIn);
  doc.addEventListener("mouseup", onMouseUp, true);
  return () => {
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("focusin", onFocusIn);
    doc.removeEventListener("mouseup", onMouseUp, true);
    installed = false;
  };
}
