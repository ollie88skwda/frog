// Tier and PMID drift guard for the rule library, plus the report §12 copy
// lint. fixtures: program/fixtures/research-rules.json is a snapshot of every
// `- R#/C#. [T#]` line (tier + PMIDs) in PROGRAM-RULES.md / COACH-LOGIC.md.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROGRAM_TEMPLATES } from "../program/templates";
import { validateProgram } from "../program/validate";
import { viewOf } from "../program/view";
import { EVIDENCE_RULES, evidenceRule, weakestTier } from "./rules";

const research = JSON.parse(
  readFileSync(
    new URL("../program/fixtures/research-rules.json", import.meta.url),
    "utf8",
  ),
) as Record<string, { tier: string; pmids: string[] }>;

describe("evidence rule library vs the research text", () => {
  it("has unique ids", () => {
    const ids = EVIDENCE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const r of EVIDENCE_RULES) {
    it(`${r.id} tier and citations match the research`, () => {
      const src = research[r.id];
      expect(src, `${r.id} missing from the research snapshot`).toBeDefined();
      expect(r.tier).toBe(src.tier);
      for (const c of r.cites)
        expect(src.pmids, `${r.id} cites ${c.label}`).toContain(c.pmid);
    });
    it(`${r.id} has plain text and a tier note`, () => {
      expect(r.plain.length).toBeGreaterThan(20);
      expect(r.tierNote.length).toBeGreaterThan(5);
    });
  }
  it("weakestTier takes the highest-numbered tier", () => {
    expect(weakestTier(["R1", "R4"])).toBe("T1");
    expect(weakestTier(["R1", "R8b"])).toBe("T5");
    expect(weakestTier([])).toBe("T5");
  });
});

// Report §12: phrases the app must never say. Applied to library text and to
// every message the validator can emit for the shipped templates.
const BANNED: [RegExp, string][] = [
  [/optimal volume/i, "optimal volume"],
  [/\bMRV\b|\bMEV\b|\bMAV\b/, "MRV/MEV/MAV"],
  [/grows? faster|grow muscle faster|grow faster/i, "grows faster"],
  [/\brequired\b/i, "required"],
  [/\bequivalent\b/i, "equivalent"],
  [/stops? (muscle )?growth/i, "stops growth"],
  [/per.meal/i, "per-meal target"],
];

describe("copy lint (report §12)", () => {
  const texts = [
    ...EVIDENCE_RULES.flatMap((r) => [r.plain, r.tierNote]),
    ...PROGRAM_TEMPLATES.flatMap((t) => [
      t.summary,
      ...t.sessions.flatMap((s) =>
        s.slots.flatMap((x) => [
          x.note ?? "",
          ...x.menu.map((m) => m.why ?? ""),
        ]),
      ),
      ...validateProgram(viewOf(t)).findings.map((f) => f.message),
    ]),
  ].filter(Boolean);
  for (const [re, label] of BANNED)
    it(`no "${label}"`, () => {
      expect(texts.filter((t) => re.test(t))).toEqual([]);
    });
  it("the Frog default blurb is the approved wording", () => {
    expect(PROGRAM_TEMPLATES[0].summary).toBe(
      "Oliver's method. Top set first, 4-8 reps, 1-3 RIR, every other day. Where this goes beyond the evidence, the Why sheet says so.",
    );
  });
  it("deload copy never promises size gains (R17)", () => {
    expect(evidenceRule("R17")!.plain).toContain("effect on size is unknown");
  });
});
