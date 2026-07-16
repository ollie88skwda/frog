import { useEffect, useRef, useState } from "react";

// One shared IntersectionObserver for the whole app — a per-element observer
// would mean ~900 observers for the exercise library. Elements register a
// callback via a WeakMap; the observer fans entries back out to them.
const callbacks = new WeakMap<Element, (inView: boolean) => void>();
let observer: IntersectionObserver | null = null;

function sharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        callbacks.get(entry.target)?.(entry.isIntersecting);
      }
    },
    // Prefetch rows just below the fold so scrolling reveals ready content.
    { rootMargin: "300px 0px" },
  );
  return observer;
}

/**
 * Latching viewport visibility: `inView` flips to true the first time the
 * element enters (or nears) the viewport and then stays true, so the gated
 * work (e.g. a per-row query) runs once and its result is kept. Used to avoid
 * firing ~900 last-set lookups when the library first renders.
 */
export function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const obs = sharedObserver();
    if (!obs) {
      // No IntersectionObserver (older/SSR) — degrade to always-on.
      setInView(true);
      return;
    }
    const onChange = (visible: boolean) => {
      if (visible) setInView(true);
    };
    callbacks.set(el, onChange);
    obs.observe(el);
    return () => {
      obs.unobserve(el);
      callbacks.delete(el);
    };
  }, [inView]);

  return [ref, inView] as const;
}
