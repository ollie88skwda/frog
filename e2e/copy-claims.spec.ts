import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";

// Copy anti-claims (redesign plan §12, from research-feature-map §3). Shipped
// copy must never state these; the plan's wording is "not shown better or
// worse", "planning range", "for fatigue and recovery", "easier to load".
// Pure source scan: no browser or backend, so it also runs outside a seeded
// `bun run e2e`. A hit means a sentence the evidence does not support —
// reword it (don't add the phrase to the allowlist unless it is a negation).

const ROOT = join(__dirname, "..");
const SCAN = [
  "apps/web/src",
  "apps/web/public/llms.txt",
  "packages/core/src",
  "packages/mcp/src",
];
const SKIP_FILE = /\.(test|spec)\.tsx?$|\/dev\/|\.d\.ts$/;

const BANNED: [id: string, re: RegExp][] = [
  [
    "R3 identical full-body grows more",
    /identical (full[- ]body )?sessions?[^.]{0,60}(grow|better|superior)/i,
  ],
  [
    "R5 3.5 sessions/week required",
    /3\.5 (sessions?|times|x|×)[^.]{0,40}(required|needed|must|necessary)/i,
  ],
  [
    "R7 per-session volume cap",
    /per[- ]session (volume )?(cap|limit|ceiling|maximum)|more than \d+ (direct )?sets? (per|in a) session (is|are|will)/i,
  ],
  [
    "R13 stable exercises grow faster",
    /stable (exercises?|machines?)[^.]{0,50}(grow|faster|better|more (muscle|size))/i,
  ],
  [
    "R14 lengthened partials better",
    /lengthened partials?[^.]{0,30}\b(are|is) (better|superior|equivalent|best)/i,
  ],
  [
    "R17/R18 deload or break builds size",
    /(deloads?|breaks?|time off)[^.]{0,40}(build|grow|increase|boost)s? (muscle|size|gains)/i,
  ],
  [
    "R22 sleep/stress changes growth",
    /(sleep|stress)[^.]{0,30}(changes?|reduces?|boosts?|increases?|limits?) (your )?(muscle )?(growth|hypertrophy)/i,
  ],
  [
    "C8 cut volume after one bad night",
    /(bad|poor|short) (night|sleep)[^.]{0,40}(cut|reduce|lower|drop) (your )?(volume|sets)/i,
  ],
  [
    "R23d cardio stops growth",
    /cardio[^.]{0,30}(stops?|kills?|blunts?|hurts?|ruins?|limits?) (muscle )?(growth|gains|hypertrophy)/i,
  ],
  [
    "R10/C6 failure required",
    /(failure is (required|necessary|needed)|must (train )?to failure|only (the )?last 5 reps)/i,
  ],
  ["C6 effective reps", /effective reps/i],
  ["validated volume landmarks", /\b(MEV|MRV|MAV)\b|optimal (weekly )?volume/i],
  [
    "per-meal protein target",
    /per[- ]meal (protein|growth)|\d+ ?g protein (per|each|every) meal/i,
  ],
  [
    "caffeine for growth",
    /caffeine[^.]{0,30}(grow|build|gain)s? (muscle|size)/i,
  ],
  [
    "required creatine loading",
    /creatine loading[^.]{0,20}(required|needed|necessary)|you (must|need to) (load|saturate)/i,
  ],
  [
    "sex-specific programming",
    /(women|female|men|male)s? (should|need to|must) (train|do|use|lift)/i,
  ],
];

/** "There is no per-session volume ceiling" denies the claim; don't flag it. */
function isNegated(text: string, at: number): boolean {
  return /\b(no|not|never|without|isn't|doesn't|don't)\b[^.]{0,25}$/i.test(
    text.slice(Math.max(0, at - 30), at),
  );
}

function files(path: string): string[] {
  const abs = join(ROOT, path);
  const st = statSync(abs);
  if (st.isFile()) return [abs];
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|txt|md)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name))
    .filter((f) => !SKIP_FILE.test(f) && !f.includes("node_modules"));
}

test("shipped copy contains none of the plan's banned claims", () => {
  const hits: string[] = [];
  for (const f of SCAN.flatMap(files)) {
    // Code comments are not shipped copy.
    const text = readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    for (const [id, re] of BANNED) {
      const m = re.exec(text);
      if (m && !isNegated(text, m.index))
        hits.push(`${relative(ROOT, f)}: [${id}] "${m[0]}"`);
    }
  }
  expect(hits, hits.join("\n")).toEqual([]);
});

test("the guard itself catches a banned sentence", () => {
  const sample = "Sleep reduces muscle growth, so cut your volume.";
  expect(BANNED.some(([, re]) => re.test(sample))).toBe(true);
  const ok = "Sleep and stress do not change how much you grow.";
  expect(BANNED.some(([, re]) => re.test(ok))).toBe(false);
  expect(isNegated("There is no per-session volume ceiling", 12)).toBe(true);
  expect(isNegated("Use a per-session volume ceiling", 6)).toBe(false);
});
