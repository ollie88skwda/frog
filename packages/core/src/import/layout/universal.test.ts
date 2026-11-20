import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUTINE, TABLE } from "../../../../../scripts/universal/fixtures";
import { score, type Truth } from "../../../../../scripts/universal/measure";
import {
  loadPng,
  makeNodeEngine,
} from "../../../../../scripts/universal/node-engine";
import { isLowConfidence } from "../draft";
import { detectInputKind, unsupportedMessage } from "../input-kind";
import { scanBitmap } from "./scan";
import { parseWeightReps, voteDroppedDigits } from "./share-table";
import {
  completeName,
  readScan,
  readsToDraft,
  stitchRows,
  stitchTextLines,
} from "./universal";

const bytes = (...n: number[]) =>
  new Uint8Array([...n, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("parseWeightReps", () => {
  it.each([
    ["295 Ibs x 7", 295, 7],
    ["65 lbs x 8", 65, 8],
    ["351bs x 7", 35, 7], // glued: 35 + "1bs"
    ["2801Ibs x5", 280, 5],
    ["115 Ibs × 8", 115, 8],
  ])("%s", (text, w, r) => {
    expect(parseWeightReps(text)).toEqual({ weight: w, reps: r, unit: "lb" });
  });
  it("reads kg and rejects non-sets", () => {
    expect(parseWeightReps("62.5 kg x 8")?.unit).toBe("kg");
    expect(parseWeightReps("Cable Extension")).toBeNull();
  });
});

describe("voteDroppedDigits", () => {
  it("counts a digit-dropped reading for the longer weight", () => {
    const r = voteDroppedDigits([
      { value: "115|8|lb", conf: 0.8 },
      { value: "15|8|lb", conf: 0.8 },
      { value: "15|8|lb", conf: 0.8 },
      { value: "115|8|lb", conf: 0.9 },
    ]);
    expect(r?.value).toBe("115|8|lb");
  });
});

describe("stitching", () => {
  const row = (index: number, name: string, partial = false, q = 1) => ({
    index,
    name,
    partial,
    q,
  });
  it("dedupes overlapping rows, prefers whole rows, reports gaps", () => {
    const { rows, gaps } = stitchRows(
      [
        [row(1, "A"), row(2, "B"), row(3, "C", true)],
        [row(3, "C"), row(4, "D")],
        [row(6, "F")],
      ],
      (r) => r.q,
    );
    expect(rows.map((r) => r.name)).toEqual(["A", "B", "C", "D", "F"]);
    expect(rows.find((r) => r.name === "C")?.partial).toBe(false);
    expect(gaps).toEqual([5]);
  });
  it("drops lines shared by two scrolled text shots", () => {
    const l = (t: string) => ({ text: t, confidence: 1 });
    const out = stitchTextLines([
      [l("a"), l("b"), l("c")],
      [l("b"), l("c"), l("d")],
    ]);
    expect(out.map((x) => x.text)).toEqual(["a", "b", "c", "d"]);
  });
  it("completes a name the app shortened", () => {
    const known = ["Incline Dumbbell Curl (45 Degrees)", "Leg Extension"];
    expect(completeName("Incline Dumbbell Curl (45De...", known)).toBe(
      known[0],
    );
    expect(completeName("Totally Other...", known)).toBeNull();
  });
});

describe("detectInputKind", () => {
  it("sniffs by bytes before name", () => {
    expect(
      detectInputKind("x.dat", "", bytes(0x89, 0x50, 0x4e, 0x47)).kind,
    ).toBe("image");
    expect(
      detectInputKind("x.jpg", "", bytes(0x25, 0x50, 0x44, 0x46)).kind,
    ).toBe("pdf");
    const heic = new Uint8Array([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    expect(detectInputKind("IMG_1.HEIC", "", heic)).toEqual({
      kind: "image",
      heic: true,
    });
    expect(detectInputKind("a.xlsx", "", bytes(0x50, 0x4b, 3, 4)).kind).toBe(
      "xlsx",
    );
  });
  it("routes text types and refuses the rest with a clear message", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(detectInputKind("a.json", "", enc('{"a":1}')).kind).toBe("json");
    expect(detectInputKind("a.csv", "", enc("a,b\n1,2")).kind).toBe("csv");
    expect(detectInputKind("notes", "", enc("Bench 100x5")).kind).toBe("text");
    const doc = detectInputKind("plan.docx", "", bytes(0x50, 0x4b, 3, 4));
    expect(doc.kind).toBe("unsupported");
    expect(unsupportedMessage("plan.docx", doc)).toMatch(
      /Word document.*PNG, JPG, HEIC/,
    );
    expect(
      detectInputKind("x.bin", "", new Uint8Array([1, 0, 2, 0])).kind,
    ).toBe("unsupported");
  });
});

const FIX = new URL("./fixtures/", import.meta.url).pathname;
const haveOcr = existsSync(
  new URL(
    "../../../../../apps/web/node_modules/@tesseract.js-data",
    import.meta.url,
  ).pathname,
);

// Real tesseract over the committed synthetic screenshots (1170x2532).
describe.skipIf(!haveOcr)(
  "universal import on synthetic fixture screenshots",
  () => {
    it("builds one stitched routine and one session with L/R pairs, flagging what it can't be sure of", async () => {
      const { engine, terminate } = await makeNodeEngine();
      try {
        const reads = [];
        for (const id of ["routine-3", "routine-1", "table", "routine-2"]) {
          // shuffled order: stitching goes by row number, not by file order
          reads.push(
            await readScan(
              await scanBitmap(loadPng(`${FIX}${id}.png`), engine),
            ),
          );
        }
        expect(reads.map((r) => r.kind)).toEqual([
          "routine-list",
          "routine-list",
          "share-table",
          "routine-list",
        ]);
        const draft = readsToDraft(reads, { defaultUnit: "kg" });
        expect(draft.unit).toBe("lb");
        const r = draft.routines[0];
        expect(r.name).toBe("Push Pull");
        expect(r.exercises.map((e) => e.rawName)).toEqual(
          ROUTINE.exercises.map((e) => e.name),
        );
        expect(r.exercises[0]).toMatchObject({ sets: 2, reps: 8, repsMax: 12 });

        const s = draft.sessions[0];
        // 9 whole rows + a 10th cut off at the bottom of the screenshot
        const whole = s.exercises.slice(0, 9);
        const truth: Truth = {
          session: {
            exercises: TABLE.slice(0, 9).map(
              ([name, c, weight, reps, rir]) => ({
                name: name
                  .replace("(45 Deg...", "(45 Degrees)")
                  .replace("Mach...", "Machine Row"),
                sets:
                  c === 2
                    ? [
                        { side: "left", weight, reps, rir },
                        { side: "right", weight, reps, rir },
                      ]
                    : [{ weight, reps, rir }],
              }),
            ),
          },
        };
        const sc = score(
          { ...draft, sessions: [{ ...s, exercises: whole }] },
          truth,
        );
        for (const k of [
          "session names + order",
          "session weight",
          "session reps",
          "session RIR",
          "session left/right sides",
        ])
          expect(sc.out[k], k).toEqual({
            ok: sc.out[k].total,
            total: sc.out[k].total,
          });
        expect(sc.wrongUnflagged).toEqual([]);
        // the cut-off row is not guessed: it is flagged
        const last = s.exercises[9];
        expect(last.sets.every((x) => isLowConfidence(x.confidence))).toBe(
          true,
        );
        // the right side of a one-sided pair is flagged for review
        const pair = s.exercises[1].sets;
        expect(pair.map((x) => x.side)).toEqual(["left", "right"]);
        expect(isLowConfidence(pair[1].confidence)).toBe(true);
      } finally {
        await terminate();
      }
    }, 180_000);
  },
);
