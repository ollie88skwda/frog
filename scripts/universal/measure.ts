// Measure the universal import against images + a ground-truth JSON.
//   bun scripts/universal/measure.ts <truth.json> <image>... [--report out.md]
// truth.json: { routine: {name, exercises:[{name, reps?, repsMax?}]},
//               session: {exercises:[{name, sets:[{side?,weight,reps,rir}]}]} }
// Real screenshots hold personal data, so their truth stays outside the repo;
// the committed fixtures have their own truth in fixtures.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { sameExerciseName } from "../../packages/core/src/domain/match-exercise";
import { isLowConfidence } from "../../packages/core/src/import/draft";
import { scanBitmap } from "../../packages/core/src/import/layout/scan";
import {
  readScan,
  readsToDraft,
} from "../../packages/core/src/import/layout/universal";
import { loadPng, makeNodeEngine } from "./node-engine";

export type Truth = {
  routine?: {
    name: string;
    exercises: {
      name: string;
      sets?: number;
      reps?: number;
      repsMax?: number;
    }[];
  };
  session?: {
    exercises: {
      name: string;
      sets: {
        side?: "left" | "right";
        weight: number;
        reps: number;
        rir: number;
      }[];
    }[];
  };
};

export function score(draft: ReturnType<typeof readsToDraft>, truth: Truth) {
  const out: Record<string, { ok: number; total: number }> = {};
  const add = (k: string, ok: boolean) => {
    out[k] ??= { ok: 0, total: 0 };
    out[k].total++;
    if (ok) out[k].ok++;
  };
  const flagged: string[] = [];
  const wrongUnflagged: string[] = [];
  if (truth.routine) {
    const r = draft.routines[0];
    add(
      "routine title",
      !!r && (r.name ?? "").toLowerCase() === truth.routine.name.toLowerCase(),
    );
    add(
      "routine exercise count",
      r?.exercises.length === truth.routine.exercises.length,
    );
    truth.routine.exercises.forEach((t, i) => {
      const g = r?.exercises[i];
      add("routine names + order", !!g && sameExerciseName(g.rawName, t.name));
      if (t.reps != null) {
        add(
          "routine rep range",
          !!g &&
            g.reps === t.reps &&
            (g.repsMax ?? null) === (t.repsMax ?? null),
        );
        add("routine set count", !!g && g.sets === t.sets);
      }
      if (g && isLowConfidence(g.confidence))
        flagged.push(`routine ${i + 1} ${g.rawName}`);
    });
  }
  if (truth.session) {
    const s = draft.sessions[0];
    add(
      "session exercise count",
      s?.exercises.length === truth.session.exercises.length,
    );
    truth.session.exercises.forEach((t, i) => {
      const g = s?.exercises[i];
      const nameOk = !!g && sameExerciseName(g.rawName, t.name);
      add("session names + order", nameOk);
      add(
        "session set count (L/R pair = 1)",
        !!g &&
          new Set(g.sets.map((x) => x.setNo)).size ===
            t.sets.filter((x) => x.side !== "right").length,
      );
      t.sets.forEach((ts, k) => {
        const gs = g?.sets[k];
        const w = !!gs && gs.weight === ts.weight;
        const rp = !!gs && gs.reps === ts.reps;
        const ri = !!gs && gs.rir === ts.rir;
        const sd = !!gs && (gs.side ?? undefined) === (ts.side ?? undefined);
        add("session weight", w);
        add("session reps", rp);
        add("session RIR", ri);
        add("session left/right sides", sd);
        if (gs && !(w && rp && ri && sd) && !isLowConfidence(gs.confidence))
          wrongUnflagged.push(`${t.name} set ${k + 1}`);
      });
      if (g && !nameOk && !isLowConfidence(g.confidence))
        wrongUnflagged.push(`${t.name} (name)`);
    });
    for (const e of s?.exercises ?? [])
      for (const x of e.sets)
        if (isLowConfidence(x.confidence))
          flagged.push(`${e.rawName} ${x.side ?? ""}`.trim());
  }
  return { out, flagged, wrongUnflagged };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const ri = args.indexOf("--report");
  const reportPath = ri >= 0 ? args.splice(ri, 2)[1] : null;
  const [truthPath, ...images] = args;
  const truth: Truth = JSON.parse(readFileSync(truthPath, "utf8"));
  const { engine, terminate } = await makeNodeEngine();
  const reads = [];
  const t0 = Date.now();
  for (const img of images) {
    const scan = await scanBitmap(loadPng(img), engine);
    const r = await readScan(scan);
    console.log(img.split("/").pop(), "->", r.kind);
    reads.push(r);
  }
  await terminate();
  const draft = readsToDraft(reads, { defaultUnit: "kg" });
  const { out, flagged, wrongUnflagged } = score(draft, truth);
  let md = "| Check | Correct |\n|---|---|\n";
  for (const [k, v] of Object.entries(out))
    md += `| ${k} | ${v.ok}/${v.total} (${Math.round((100 * v.ok) / v.total)}%) |\n`;
  md += `\nTime: ${((Date.now() - t0) / 1000).toFixed(0)} s for ${images.length} images\n`;
  md += `Rows flagged for review: ${flagged.length}${flagged.length ? ` (${flagged.join("; ")})` : ""}\n`;
  md += `Wrong but NOT flagged: ${wrongUnflagged.length}${wrongUnflagged.length ? ` (${wrongUnflagged.join("; ")})` : ""}\n`;
  md += `Draft notes:\n${draft.notes.map((n) => `- ${n}`).join("\n")}\n`;
  console.log(md);
  if (reportPath) writeFileSync(reportPath, md);
}
