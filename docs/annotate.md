# Click-to-comment

A dev-only annotation overlay. Point at anything in the running app, write what's
wrong with it, then copy the lot as markdown and paste it into a chat with an
agent. It replaces "the button on the training page, the second one, you know the
one" with a file, a line, and a test id.

**It can never reach production**: the overlay is behind a dead branch in
`app.tsx` that folds to a literal `false` in a production build (so Rollup drops
the dynamic import and the whole subtree), and `scripts/check-bundle.ts` fails
the build if either of its markers appears in an emitted chunk anyway.

## Turning it on

Available on `bun run dev` (and in `VITE_E2E=1` builds, which is how the e2e
spec drives it). Off by default, every load.

- **Keyboard:** a bare `A` toggles the mode (case-insensitive — `a` or `A`;
  `Ctrl`/`Cmd`/`Option`+A never do, since `Ctrl+A` is select-all in any app).
  Typing `a` while focused in an input, textarea, select, or content-editable
  never toggles, so the letter is safe mid-type. `Esc` closes the composer, then
  exits the mode.
- **Touch:** the floating **◎ Annotate** button, bottom-left. Next to it, an
  **N notes** button opens the list — that one works whether or not the mode is
  on, so you can review and copy later. When the mode is off *and* there are no
  notes, the control collapses to a single small chip (so it never sits on top
  of app controls like the finish sheet's Discard); it expands as soon as you
  start annotating or a note exists to review.

While the mode is on, pointer, key and focus events are intercepted at the
document level, so clicking a button annotates it instead of firing it, and
stray keystrokes stay quiet. The page still scrolls.
Turning the mode off restores everything — no listeners remain except the focus
guard below.

Focus is the one interception that outlives the mode, and the one to look at if
you are ever debugging a `onBlur` that didn't fire. Blur is load-bearing in this
app — a session row auto-commits its set when you leave a field, and
`measures`/`conditions`/`exercise-editor`/`machines` all save on blur — but the
overlay moves focus itself (entering the mode blurs the active element, the
composer takes focus), so the app must never see a focus change the tool caused.
The overlay's own chrome also refuses pointer focus for the same reason, mode on
or off: tapping the floating toggle, or any part of the notes panel, would
otherwise blur the field you were typing in. Everything but text entry is
covered, so one side effect is that note text in the list can't be
drag-selected — use **Copy all**, or **Edit** for a real textarea.

Focus arriving *in* the overlay is hidden from the app for the opposite reason:
every dialog in the app is modal, and Radix's focus trap pulls focus back the
moment it lands outside the dialog. Without that half, the composer would open
over a sheet with no caret and swallow everything you typed.

Point at an element (hover on desktop, tap on a phone) to outline it and see a
label; click/tap to open the composer. Write the note, **Add note** (or
`⌘/Ctrl+Enter`). Notes accumulate in localStorage and survive a reload. **Copy
all** never clears — **Clear all** is a separate, armed action.

## What gets copied

```markdown
# Frog UI feedback — 1 note
Captured 2026-08-06T22:07:58.392Z · http://localhost:5199

Each note points at one element in the running app. `Source` is the JSX
that rendered it — start there.

## 1. <button> "Start empty workout"
- Source: apps/web/src/screens/train.tsx:113:9 (nearest JSX ancestor of the click)
- Component: Button (in TrainScreen)
- Test id: `start-session-btn`
- Selector: `div > div:nth-of-type(2) > div > button[data-testid="start-session-btn"]`
- Route: `/train`
- Viewport: 390×664

Make this the primary action.
```

Notes come out in capture order. Any field that isn't available is omitted
rather than printed empty. Serialization lives in
`apps/web/src/dev/annotate/format.ts` and is unit-tested (`format.test.ts`).

## How the identity is derived (and why nothing needs wiring)

The one hard requirement: **never touch a feature component to make it
annotatable**. Everything is resolved generically from the event target.

| Field | Source |
|---|---|
| `Source` | `data-frog-src` on the clicked node's nearest stamped ancestor-or-self |
| owner component | `data-frog-cmp` on that same node |
| nearest component | React fiber walk (`__reactFiber$…` → `.return`), dev server only |
| test id / aria / role | ordinary DOM attributes |
| `Selector` | tag + test id / id / `nth-of-type`, four levels up |
| text | `innerText`, whitespace-collapsed, truncated |
| route, url, viewport | `location` / `window`, captured at click time |

`data-frog-src` / `data-frog-cmp` are stamped onto every **intrinsic** JSX
element at transform time by `apps/web/plugins/annotate-source.ts`, a ~40-line
Babel plugin wired into `@vitejs/plugin-react` in `vite.config.ts` only when
`command === "serve"` or `VITE_E2E=1`. React 19 removed the fiber
`_debugSource` field, so a build-time stamp is the only way to recover a source
location at all — verified against the installed react/react-dom, which contain
no `_debugSource`.

Two consequences worth knowing:

- **Component elements are not stamped.** An attribute on `<Button>` is just a
  prop: it only reaches the DOM if that component spreads `...rest`, and it can
  be handed to non-DOM consumers (`<Route>`, `<Suspense>`). So the stamp lands
  on the nearest host element instead, which is normally within a couple of
  lines — the payload says `(nearest JSX ancestor of the click)` when the
  clicked node wasn't itself stamped.
- **node_modules is never stamped**, because Babel doesn't transform it. That's
  a feature: a Radix- or lucide-rendered `<button>` resolves up to *app* source
  rather than to a vendored file.

The fiber-derived component name is dev-server-only on purpose: any built
artifact is minified, where `fiber.type.name` is a mangled two-letter token
(`Component: Cp (in TrainScreen)`) that reads as noise. The stamp is the field
to trust everywhere.

## Tests

- `apps/web/src/dev/annotate/format.test.ts` — the markdown payload, in
  isolation (`bun run test`).
- `e2e/annotate.spec.ts` — turns the mode on, clicks a real button, asserts no
  session started, records a note, and asserts the **clipboard** payload carries
  the source path, component, test id, selector, route and viewport; plus edit,
  reload-persistence, armed clear, and that normal clicks resume when the mode
  is off (and, as a regression guard, that no bare letter key ever navigates
  the app, mode on or off — and that the dev-only bare `a` toggles the mode
  while exempting text entry).
- `scripts/check-bundle.ts` — the production gate. Prove it still bites by
  inverting it: a `VITE_E2E=1` build must fail the script, a clean build must
  pass.
