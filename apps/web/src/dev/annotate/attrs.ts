// The contract between the build-time JSX stamper (apps/web/plugins/
// annotate-source.ts) and the runtime overlay that reads it. Kept in its own
// dependency-free module so both sides import the same literals — the plugin
// runs in Node, the overlay in the browser, and a drifting copy in either
// would fail silently (every click would just look "unstamped").

/** `data-frog-src="apps/web/src/screens/train.tsx:129:13"` */
export const SRC_ATTR = "data-frog-src";
/** `data-frog-cmp="TrainScreen"` — component that owns the stamped JSX. */
export const CMP_ATTR = "data-frog-cmp";
/** Marks the overlay's own chrome so its clicks are never annotated. */
export const UI_ATTR = "data-frog-annotate-ui";
