// The 19 worked examples (research/hypertrophy/notes/coach-worked-examples.md)
// as table-driven fixtures, then precedence, boundary and guardrail tests.
import { describe, it } from "vitest";
import { evaluateCoach } from "./evaluate";
import type { CaseFixture } from "./fixtures/build";
import { fixture as c1 } from "./fixtures/case-01";
import { fixture as c2 } from "./fixtures/case-02";
import { fixture as c3 } from "./fixtures/case-03";
import { fixture as c4 } from "./fixtures/case-04";
import { fixture as c5 } from "./fixtures/case-05";
import { fixture as c6 } from "./fixtures/case-06";
import { fixture as c7 } from "./fixtures/case-07";
import { fixture as c8 } from "./fixtures/case-08";
import { fixture as c9 } from "./fixtures/case-09";
import { fixture as c10 } from "./fixtures/case-10";
import { fixture as c11 } from "./fixtures/case-11";
import { fixture as c12 } from "./fixtures/case-12";
import { fixture as c13 } from "./fixtures/case-13";
import { fixture as c14 } from "./fixtures/case-14";
import { fixture as c15 } from "./fixtures/case-15";
import { fixture as c16 } from "./fixtures/case-16";
import { fixture as c17 } from "./fixtures/case-17";
import { fixture as c18 } from "./fixtures/case-18";
import { fixture as c19 } from "./fixtures/case-19";

const cases: CaseFixture[] = [
  c1,
  c2,
  c3,
  c4,
  c5,
  c6,
  c7,
  c8,
  c9,
  c10,
  c11,
  c12,
  c13,
  c14,
  c15,
  c16,
  c17,
  c18,
  c19,
];

describe("coach worked examples (COACH-LOGIC)", () => {
  for (const c of cases)
    describe(`case ${String(c.id).padStart(2, "0")}: ${c.title}`, () => {
      for (const p of c.points)
        it(`at ${p.at}`, () => p.check(evaluateCoach(p.input)));
    });
});
