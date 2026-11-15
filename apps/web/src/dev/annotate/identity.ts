// DOM → AnnotationTarget. Entirely generic: nothing here knows about any Frog
// screen or component, so a screen that does not exist yet is annotatable the
// day it is written, with no wiring.

import { CMP_ATTR, SRC_ATTR } from "./attrs";
import type { AnnotationTarget } from "./format";
import { truncateText } from "./format";

type Fiber = { type?: unknown; return?: Fiber | null };

/** Nearest React component name from the fiber tree — the one identity the
 * build-time stamp can't give, since a stamp names the component that *wrote*
 * the JSX, not the one that rendered it (`Button`, not `TrainScreen`).
 *
 * Dev server only, and deliberately so: any built artifact is minified, where
 * `fiber.type.name` is a mangled two-letter token that reads as noise in the
 * payload (`Component: Cp (in TrainScreen)` — observed, which is what killed
 * the unconditional version). The stamp is the reliable field everywhere. */
function nearestComponentName(el: Element): string | null {
  if (!import.meta.env.DEV) return null;
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  if (!key) return null;
  let fiber = (el as unknown as Record<string, Fiber | undefined>)[key] ?? null;
  for (let hops = 0; fiber && hops < 40; hops++, fiber = fiber.return ?? null) {
    const type = fiber.type;
    if (typeof type !== "function") continue;
    const named = type as { displayName?: string; name?: string };
    const name = named.displayName ?? named.name;
    if (name && /^[A-Z]/.test(name)) return name;
  }
  return null;
}

function step(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const testId = el.getAttribute("data-testid");
  if (testId) return `${tag}[data-testid="${testId}"]`;
  if (el.id) return `${tag}#${el.id}`;
  const parent = el.parentElement;
  if (!parent) return tag;
  const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName);
  if (sameTag.length < 2) return tag;
  return `${tag}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

/** A short, readable ancestor path — deliberately NOT a full CSS selector.
 * Tailwind class soup carries no identity and would drown the payload, so
 * steps are tag + test id / id / nth-of-type only. */
export function elementPath(el: Element, maxDepth = 4): string {
  const steps: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && steps.length < maxDepth) {
    steps.unshift(step(node));
    node = node.parentElement;
  }
  return steps.join(" > ");
}

function parseSource(raw: string | null) {
  if (!raw) return { file: null, line: null, column: null };
  const m = /^(.*?):(\d+):(\d+)$/.exec(raw);
  if (!m) return { file: raw, line: null, column: null };
  return { file: m[1], line: Number(m[2]), column: Number(m[3]) };
}

export function describeElement(el: Element): AnnotationTarget {
  const stamped = el.closest(`[${SRC_ATTR}]`);
  const { file, line, column } = parseSource(
    stamped?.getAttribute(SRC_ATTR) ?? null,
  );
  const labelled = el.closest("[data-testid]");
  return {
    file,
    line,
    column,
    exact: stamped === el,
    ownerComponent: stamped?.getAttribute(CMP_ATTR) ?? null,
    nearestComponent: nearestComponentName(el),
    tag: el.tagName.toLowerCase(),
    testId: labelled?.getAttribute("data-testid") ?? null,
    ariaLabel: truncateText(
      el.getAttribute("aria-label") ?? el.getAttribute("title"),
      80,
    ),
    role: el.getAttribute("role"),
    selector: elementPath(el),
    // The visible text is usually the fastest way for an agent to find the
    // thing, so it is worth the bytes.
    text: truncateText(
      el instanceof HTMLElement ? el.innerText : el.textContent,
    ),
    route: `${location.pathname}${location.search}`,
    url: location.href,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}
