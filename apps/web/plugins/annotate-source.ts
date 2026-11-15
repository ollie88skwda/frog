// Dev/E2E-only Babel plugin: stamps every *intrinsic* JSX element with the
// source location that wrote it (`data-frog-src="path/to/file.tsx:line:col"`)
// and the name of the enclosing component (`data-frog-cmp`).
//
// Why a build-time stamp at all: React 19 removed the fiber `_debugSource`
// field (verified — no `_debugSource` anywhere in the installed react /
// react-dom), so there is no runtime way to recover where a DOM node came
// from. The click-to-comment overlay (src/dev/annotate/) reads these
// attributes off the clicked node's nearest stamped ancestor-or-self.
//
// Why only intrinsic (lowercase) elements: adding an attribute to a
// *component* element makes it an ordinary prop, which only reaches the DOM if
// that component happens to spread `...rest`, and can be handed to non-DOM
// consumers (react-router `<Route>`, `<Suspense>`, render-prop wrappers). The
// nearest stamped host ancestor is within a couple of lines of the component
// call anyway, and the overlay pairs it with a fiber-derived component name.
// A useful side effect of Babel skipping node_modules: a Radix/lucide-rendered
// <button> is never stamped, so `closest()` always resolves to *app* source.
//
// Wired in vite.config.ts only when `command === "serve"` or VITE_E2E=1 — a
// production build never runs it, and scripts/check-bundle.ts fails the build
// if a stamp ever reaches a production chunk.

import { relative } from "node:path";
import { CMP_ATTR, SRC_ATTR } from "../src/dev/annotate/attrs";

/* Minimal structural types. `@babel/core` is a transitive dep of
 * @vitejs/plugin-react and is not resolvable from this workspace, so the
 * plugin is typed by shape rather than by import — Babel only ever calls it
 * with these fields. */
interface Node {
  type: string;
  id?: { type: string; name?: string } | null;
  key?: { type: string; name?: string } | null;
}
interface NodePath {
  node: Node;
  parentPath: NodePath | null;
}
interface JsxName {
  type: string;
  name?: string;
}
interface JsxAttribute {
  type: string;
  name?: JsxName;
}
interface JsxOpeningElement extends Node {
  name: JsxName;
  attributes: JsxAttribute[];
  loc?: { start: { line: number; column: number } } | null;
}
interface JsxPath extends NodePath {
  node: JsxOpeningElement;
}
interface BabelTypes {
  jsxAttribute(name: unknown, value: unknown): JsxAttribute;
  jsxIdentifier(name: string): unknown;
  stringLiteral(value: string): unknown;
}
interface PluginState {
  filename?: string | null;
  opts?: { root?: string };
}

/** Nearest enclosing PascalCase function/class name — the component that owns
 * this JSX. Walks the AST rather than relying on runtime names, so it survives
 * minification in the E2E build. */
function enclosingComponent(path: JsxPath): string | null {
  for (let p = path.parentPath; p; p = p.parentPath) {
    const n = p.node;
    const named =
      n.type === "FunctionDeclaration" || n.type === "ClassDeclaration"
        ? n.id?.name
        : n.type === "VariableDeclarator" && n.id?.type === "Identifier"
          ? n.id.name
          : n.type === "ClassMethod" && n.key?.type === "Identifier"
            ? n.key.name
            : undefined;
    if (named && /^[A-Z]/.test(named)) return named;
  }
  return null;
}

function hasAttr(node: JsxOpeningElement, name: string): boolean {
  return node.attributes.some(
    (a) => a.type === "JSXAttribute" && a.name?.name === name,
  );
}

export function annotateSourceBabelPlugin({ types: t }: { types: BabelTypes }) {
  return {
    name: "frog-annotate-source",
    visitor: {
      JSXOpeningElement(path: JsxPath, state: PluginState) {
        const node = path.node;
        // Intrinsic elements only: a JSXIdentifier starting lowercase.
        if (node.name.type !== "JSXIdentifier") return;
        const tag = node.name.name ?? "";
        if (!/^[a-z]/.test(tag)) return;
        if (!node.loc || !state.filename) return;
        if (hasAttr(node, SRC_ATTR)) return;

        const root = state.opts?.root;
        const file = root
          ? relative(root, state.filename).split("\\").join("/")
          : state.filename;
        // Babel columns are 0-based; report 1-based like an editor does.
        const where = `${file}:${node.loc.start.line}:${node.loc.start.column + 1}`;
        node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier(SRC_ATTR), t.stringLiteral(where)),
        );

        const component = enclosingComponent(path);
        if (component && !hasAttr(node, CMP_ATTR)) {
          node.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier(CMP_ATTR),
              t.stringLiteral(component),
            ),
          );
        }
      },
    },
  };
}
