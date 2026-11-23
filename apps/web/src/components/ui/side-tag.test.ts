import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PreviousSets, SideTag } from "./side-tag";

const fmt = (kg: number) => `${kg} kg`;

describe("SideTag", () => {
  it("renders readable L / R chips, never raised glyphs", () => {
    const html = renderToStaticMarkup(h(SideTag, { side: "left" }));
    expect(html).toContain(">L<");
    expect(html).not.toMatch(/[ᴸᴿ]/);
    expect(
      renderToStaticMarkup(h(SideTag, { side: "right", long: true })),
    ).toContain(">Right<");
  });
});

describe("PreviousSets", () => {
  it("collapses a matched pair to one value with a both-sides tag", () => {
    const html = renderToStaticMarkup(
      h(PreviousSets, {
        ghost: {
          weightKg: 30,
          reps: 10,
          otherSide: { weightKg: 30, reps: 10 },
        },
        formatWeight: fmt,
      }),
    );
    expect(html).toContain("30 kg × 10");
    expect(html).toContain("L+R");
  });

  it("labels each side of an uneven pair", () => {
    const html = renderToStaticMarkup(
      h(PreviousSets, {
        ghost: { weightKg: 30, reps: 10, otherSide: { weightKg: 28, reps: 8 } },
        formatWeight: fmt,
      }),
    );
    expect(html).toContain("30 kg × 10");
    expect(html).toContain("28 kg × 8");
    expect(html).toContain(">L<");
    expect(html).toContain(">R<");
  });

  it("is plain text for a bilateral set", () => {
    const html = renderToStaticMarkup(
      h(PreviousSets, { ghost: { weightKg: 100, reps: 5 }, formatWeight: fmt }),
    );
    expect(html).not.toContain("SideTag");
    expect(html).not.toContain(">L<");
  });
});
