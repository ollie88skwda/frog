import { describe, expect, it } from "vitest";
import {
  type AnnotationNote,
  type AnnotationTarget,
  formatNotes,
  formatSourceRef,
  truncateText,
} from "./format";

const META = {
  appName: "Frog",
  capturedAt: Date.parse("2026-08-08T09:00:00.000Z"),
  origin: "http://localhost:4319",
};

function target(over: Partial<AnnotationTarget> = {}): AnnotationTarget {
  return {
    file: "apps/web/src/screens/train.tsx",
    line: 129,
    column: 13,
    exact: true,
    ownerComponent: "TrainScreen",
    nearestComponent: "Button",
    tag: "button",
    testId: "start-session-btn",
    ariaLabel: null,
    role: null,
    selector: 'div > button[data-testid="start-session-btn"]',
    text: "Start empty workout",
    route: "/train",
    url: "http://localhost:4319/train",
    viewport: { w: 390, h: 844 },
    ...over,
  };
}

function note(comment: string, over: Partial<AnnotationTarget> = {}) {
  return {
    id: `n-${comment}`,
    comment,
    createdAt: META.capturedAt,
    target: target(over),
  } satisfies AnnotationNote;
}

describe("truncateText", () => {
  it("collapses whitespace", () => {
    expect(truncateText("  Start\n  empty   workout ")).toBe(
      "Start empty workout",
    );
  });

  it("returns null for blank input", () => {
    expect(truncateText("   \n ")).toBeNull();
    expect(truncateText(null)).toBeNull();
    expect(truncateText(undefined)).toBeNull();
  });

  it("truncates to the limit with an ellipsis", () => {
    const out = truncateText("abcdefghij", 5);
    expect(out).toBe("abcd…");
    expect(out).toHaveLength(5);
  });

  it("leaves text at exactly the limit alone", () => {
    expect(truncateText("abcde", 5)).toBe("abcde");
  });
});

describe("formatSourceRef", () => {
  it("renders file:line:col", () => {
    expect(formatSourceRef(target())).toBe(
      "apps/web/src/screens/train.tsx:129:13",
    );
  });

  it("degrades to file:line, then file, then nothing", () => {
    expect(formatSourceRef(target({ column: null }))).toBe(
      "apps/web/src/screens/train.tsx:129",
    );
    expect(formatSourceRef(target({ line: null, column: null }))).toBe(
      "apps/web/src/screens/train.tsx",
    );
    expect(formatSourceRef(target({ file: null }))).toBeNull();
  });
});

describe("formatNotes", () => {
  it("writes a header with the app name and a pluralised count", () => {
    expect(formatNotes([note("a")], META)).toContain(
      "# Frog UI feedback — 1 note",
    );
    expect(formatNotes([note("a"), note("b")], META)).toContain(
      "# Frog UI feedback — 2 notes",
    );
    expect(formatNotes([], META)).toContain("# Frog UI feedback — 0 notes");
  });

  it("stamps capture time and origin in the header", () => {
    const out = formatNotes([note("a")], META);
    expect(out).toContain("Captured 2026-08-08T09:00:00.000Z");
    expect(out).toContain("http://localhost:4319");
  });

  it("says so when there is nothing to send", () => {
    expect(formatNotes([], META)).toContain("_No notes captured._");
  });

  it("carries every identity field an agent needs", () => {
    const out = formatNotes([note("Make this the primary action.")], META);
    expect(out).toContain('## 1. <button> "Start empty workout"');
    expect(out).toContain("- Source: apps/web/src/screens/train.tsx:129:13");
    expect(out).toContain("- Component: Button (in TrainScreen)");
    expect(out).toContain("- Test id: `start-session-btn`");
    expect(out).toContain(
      '- Selector: `div > button[data-testid="start-session-btn"]`',
    );
    expect(out).toContain("- Route: `/train`");
    expect(out).toContain("- Viewport: 390×844");
    expect(out).toContain("Make this the primary action.");
  });

  it("flags an approximate source location", () => {
    const out = formatNotes([note("x", { exact: false })], META);
    expect(out).toContain(
      "- Source: apps/web/src/screens/train.tsx:129:13 (nearest JSX ancestor of the click)",
    );
  });

  it("omits fields that are unavailable rather than printing empties", () => {
    const out = formatNotes(
      [
        note("x", {
          file: null,
          line: null,
          column: null,
          testId: null,
          ownerComponent: null,
          nearestComponent: null,
          text: null,
        }),
      ],
      META,
    );
    expect(out).not.toContain("- Source:");
    expect(out).not.toContain("- Component:");
    expect(out).not.toContain("- Test id:");
    expect(out).toContain("## 1. <button>\n");
    expect(out).toContain("- Selector:");
  });

  it("does not repeat the component when the stamp and the fiber agree", () => {
    const out = formatNotes(
      [note("x", { nearestComponent: "TrainScreen" })],
      META,
    );
    expect(out).toContain("- Component: TrainScreen\n");
  });

  it("falls back to the stamped owner when the fiber name is minified away", () => {
    const out = formatNotes([note("x", { nearestComponent: null })], META);
    expect(out).toContain("- Component: TrainScreen\n");
  });

  it("keeps notes in capture order and numbers them", () => {
    const out = formatNotes(
      [note("first"), note("second"), note("third")],
      META,
    );
    expect(out.indexOf("## 1.")).toBeLessThan(out.indexOf("## 2."));
    expect(out.indexOf("## 2.")).toBeLessThan(out.indexOf("## 3."));
    expect(out.indexOf("first")).toBeLessThan(out.indexOf("second"));
    expect(out.indexOf("second")).toBeLessThan(out.indexOf("third"));
  });

  it("preserves a multi-line comment verbatim", () => {
    const out = formatNotes([note("line one\nline two")], META);
    expect(out).toContain("line one\nline two");
  });

  it("marks an empty comment rather than emitting a blank section", () => {
    expect(formatNotes([note("   ")], META)).toContain("_(no comment)_");
  });
});
