// Rule library (F10): one entry per PROGRAM-RULES / COACH-LOGIC rule the UI
// can cite. `rules.test.ts` checks every tier and PMID against the committed
// research snapshot (program/fixtures/research-rules.json) and greps the
// plain text for the banned phrases in report §12. Wording follows the
// anti-claims list: no growth claims the research does not support.

/** Evidence tier per research BRIEF: T1 meta-analysis … T5 practical default. */
export type EvidenceTier = "T1" | "T2" | "T3" | "T4" | "T5";

/** Rule IDs from PROGRAM-RULES (R#) and COACH-LOGIC (C#). */
export type RuleId = `${"R" | "C"}${number}${"" | "a" | "b" | "c" | "d"}`;

export type RuleCite = { label: string; pmid: string };

export type EvidenceRule = {
  id: RuleId;
  tier: EvidenceTier;
  /** One plain sentence. Safe to render as-is. */
  plain: string;
  /** What this tier means for this particular rule. */
  tierNote: string;
  cites: readonly RuleCite[];
};

export const EVIDENCE_TIER_LABELS: Record<EvidenceTier, string> = {
  T1: "Meta-analysis or systematic review of trials",
  T2: "Trial in trained lifters with direct size measures",
  T3: "Trial in untrained lifters, or indirect measures",
  T4: "Mechanistic model or expert consensus",
  T5: "Practical default, no direct data",
};

const PRACTICAL = "A practical default; no trial tests this exact setting.";
const c = (label: string, pmid: string): RuleCite => ({ label, pmid });

export const EVIDENCE_RULES: readonly EvidenceRule[] = [
  {
    id: "R1",
    tier: "T1",
    plain:
      "Any split that fits your week works; full body was not better or worse at matched weekly volume.",
    tierNote: "Pooled analyses agree once weekly volume is matched.",
    cites: [c("Ramos-Campo 2024", "38595233"), c("Pelland 2026", "41343037")],
  },
  {
    id: "R2",
    tier: "T5",
    plain:
      "Keep the same exercises for a block while you progress loads; that makes progress easy to read.",
    tierNote: PRACTICAL,
    cites: [],
  },
  {
    id: "R3",
    tier: "T4",
    plain:
      "Repeating the same full-body session is a schedule choice; it is not shown better or worse at matched volume.",
    tierNote: "No trial tests this exact design.",
    cites: [],
  },
  {
    id: "R4",
    tier: "T1",
    plain:
      "Spread weekly sets over at least two sessions per muscle when practical. For size at equal volume it makes little difference; for strength it helps.",
    tierNote: "Consistent across the pooled data.",
    cites: [c("Pelland 2026", "41343037"), c("Schoenfeld 2019", "30558493")],
  },
  {
    id: "R5",
    tier: "T4",
    plain:
      "How often you train a muscle is a scheduling choice, not a target; at matched volume the size effect is compatible with negligible.",
    tierNote: "Rests on a pooled model with a wide interval.",
    cites: [c("Pelland 2026", "41343037")],
  },
  {
    id: "R6",
    tier: "T4",
    plain:
      "More weekly hard sets help up to a point, with diminishing returns. About 10-20 per muscle is a starting range, not a landmark.",
    tierNote:
      "The direction is well supported; the 10-20 band and the RIR-4 hard-set line are practical defaults.",
    cites: [
      c("Schoenfeld 2017", "27433992"),
      c("Baz-Valle 2022", "35291645"),
      c("Pelland 2026", "41343037"),
      c("Schoenfeld 2019", "30153194"),
    ],
  },
  {
    id: "R7",
    tier: "T4",
    plain:
      "Helper (indirect) sets count as half a set toward a muscle's weekly total.",
    tierNote: "A modelling assumption, the best fit in one pooled model.",
    cites: [],
  },
  {
    id: "R7b",
    tier: "T5",
    plain:
      "Planning range: about 2-5 direct sets per muscle per session. No study sets a cap; this is about fatigue and session length.",
    tierNote: PRACTICAL,
    cites: [c("Schoenfeld 2019", "30153194")],
  },
  {
    id: "R8",
    tier: "T1",
    plain:
      "Light and heavy loads grew muscle similarly when sets were taken near failure; pick a range you can reach with good form.",
    tierNote: "Consistent across several meta-analyses.",
    cites: [
      c("Lopez 2021", "33433148"),
      c("Schoenfeld 2017", "28834797"),
      c("Carvalho 2022", "35015560"),
    ],
  },
  {
    id: "R8b",
    tier: "T5",
    plain:
      "Work in 3-9 reps on main and compound lifts, mostly 4-8; isolation can use 10-15. A practical choice, not the only valid one.",
    tierNote:
      "The wide-load finding is T1; the specific band is a practical choice.",
    cites: [c("Lopez 2021", "33433148"), c("Schoenfeld 2017", "28834797")],
  },
  {
    id: "R9",
    tier: "T5",
    plain:
      "Double progression: add reps inside the range, then add load. No trial compares it with other progression schemes in trained lifters.",
    tierNote: "Load and rep progression showed no clear size difference.",
    cites: [c("Plotkin 2022", "36199287")],
  },
  {
    id: "R10",
    tier: "T5",
    plain:
      "Train most working sets at about 1-3 reps in reserve; the last set of an isolation exercise can go to 0-1. Failure is not needed.",
    tierNote:
      "Failure vs non-failure is close to even; the 1-3 band is an untested default.",
    cites: [c("Grgic 2022", "33497853"), c("Robinson 2024", "38970765")],
  },
  {
    id: "R11",
    tier: "T3",
    plain:
      "Reps in reserve is an estimate. It is least accurate on early sets, so check it against logged reps.",
    tierNote: "Accuracy studies in trained and untrained lifters.",
    cites: [c("Refalo 2024", "37967832"), c("Remmert 2023", "37036795")],
  },
  {
    id: "R12",
    tier: "T4",
    plain:
      "Region and muscle length matter more than the joint action alone; head-to-head trials found similar whole-muscle growth across joint-action choices. Both views are valid ways to organise.",
    tierNote:
      "A handful of small head-to-head trials; joint action itself has no direct test.",
    cites: [
      c("Plotkin 2023", "37877099"),
      c("Kobayashi 2026", "42829982"),
      c("Larsen 2025", "40692697"),
    ],
  },
  {
    id: "R12b",
    tier: "T5",
    plain:
      "Cover each region of a muscle: squat or leg press plus leg extension for quads, a seated curl for hamstrings, an overhead extension for triceps.",
    tierNote:
      "Each region note cites its own small trial; the menu as a whole is a practical default.",
    cites: [],
  },
  {
    id: "R13",
    tier: "T5",
    plain:
      "Stable, well-loaded exercises are easier to load and progress. That is a practical reason, not a size claim.",
    tierNote: "Machine vs free-weight size difference is near zero.",
    cites: [c("Haugen 2023", "37582807")],
  },
  {
    id: "R14",
    tier: "T1",
    plain:
      "Lengthened partials are a valid size tool but are not shown better than full range.",
    tierNote: "Reviews favour full range for lower-body size.",
    cites: [c("Pallares 2021", "34170576"), c("Plotkin 2026", "42841600")],
  },
  {
    id: "R15",
    tier: "T4",
    plain:
      "Rest 2-3 minutes on heavy multi-joint lifts and 60-90 seconds on accessory and isolation sets.",
    tierNote: "Which slots count as heavy is inference.",
    cites: [c("Schoenfeld 2016", "26605807"), c("Singer 2024", "39205815")],
  },
  {
    id: "R15b",
    tier: "T4",
    plain:
      "Shorter sessions: trim sets on low-priority lifts or shorten accessory rest.",
    tierNote: "Small number of studies on time-savers.",
    cites: [c("Zhang 2025", "39903375"), c("Davies 2021", "33475986")],
  },
  {
    id: "R15d",
    tier: "T4",
    plain:
      "About 60 seconds of rest can match longer rest when weekly volume load is matched.",
    tierNote: "Not shown in trained lifters.",
    cites: [c("Longo 2022", "35622106")],
  },
  {
    id: "R16",
    tier: "T1",
    plain:
      "Exercise order showed no detectable size effect, so order your session for convenience and safety.",
    tierNote: "A pooled effect near zero.",
    cites: [c("Nunes 2021", "32077380")],
  },
  {
    id: "R17",
    tier: "T5",
    plain:
      "A deload is a fatigue and recovery tool: half the sets, same loads, 3-4 reps in reserve, about every 4-6 weeks. Its effect on size is unknown.",
    tierNote: "No trained-lifter size trial of a volume-cut deload was found.",
    cites: [
      c("Coleman 2024", "38274324"),
      c("Pancar 2026", "41730991"),
      c("Rogerson 2024", "38499934"),
    ],
  },
  {
    id: "R17b",
    tier: "T5",
    plain:
      "Warm up the first heavy lift with about 40% for 6 then 80% for 3, and later lifts with one set at 60-70%. Warm-ups never count toward volume.",
    tierNote: "Acute-performance data only.",
    cites: [c("Ribeiro 2020", "32971729")],
  },
  {
    id: "R18",
    tier: "T4",
    plain:
      "Time off is not a size cliff: loss was not significant at 12-24 weeks in the studied group.",
    tierNote: "Older adults; extrapolated to trained lifters.",
    cites: [c("Grgic 2022", "36360927")],
  },
  {
    id: "R18b",
    tier: "T4",
    plain:
      "Busy or injured weeks: about a third of normal weekly sets kept group-average size in young adults.",
    tierNote: "Group means only, extrapolated.",
    cites: [c("Bickel 2011", "21131862"), c("Grgic 2022", "36360927")],
  },
  {
    id: "R22",
    tier: "T4",
    plain:
      "One short night or one stressful day is not a reason to change your weekly volume.",
    tierNote: "The link to growth is extrapolated.",
    cites: [c("Campbell 2021", "33404378")],
  },
  {
    id: "R25",
    tier: "T5",
    plain:
      "Consider a deload when weekly best e1RM falls more than 2.5% two Monday-Sunday weeks in a row at planned effort.",
    tierNote: PRACTICAL,
    cites: [c("Pancar 2026", "41730991")],
  },
  {
    id: "C1",
    tier: "T5",
    plain:
      "One missed target is one data point. Check that day's sleep, stress and caffeine before changing anything.",
    tierNote: PRACTICAL,
    cites: [],
  },
  {
    id: "C2",
    tier: "T5",
    plain:
      "After a confirmed stall, shift the rep range heavier or add a set before cutting load.",
    tierNote: PRACTICAL,
    cites: [c("Plotkin 2022", "36199287")],
  },
  {
    id: "C2c",
    tier: "T5",
    plain:
      "Progression arithmetic: e1RM from reps plus reps in reserve, a 10% noise band, and a stall means 7+ comparable sessions with no new best in the last 6.",
    tierNote: PRACTICAL,
    cites: [],
  },
  {
    id: "C3",
    tier: "T5",
    plain: "Do not switch exercises after a single stall.",
    tierNote: PRACTICAL,
    cites: [],
  },
  {
    id: "C4",
    tier: "T5",
    plain:
      "If logged reps in reserve run well below target for a week, raise the target by 1 instead of changing load.",
    tierNote: PRACTICAL,
    cites: [c("Refalo 2024", "37967832")],
  },
  {
    id: "C5",
    tier: "T5",
    plain:
      "If logged reps in reserve run well above target, lower the target by 1, but keep compound work at 1 or more.",
    tierNote: PRACTICAL,
    cites: [],
  },
  {
    id: "C7",
    tier: "T5",
    plain:
      "On a short-sleep or high-stress day keep the plan; hold the load, and trim one set only if performance clearly drops.",
    tierNote: PRACTICAL,
    cites: [],
  },
  {
    id: "C8",
    tier: "T4",
    plain:
      "Do not change weekly volume because of one bad sleep or stress reading.",
    tierNote: "Wellness scores link only weakly to training load.",
    cites: [c("Campbell 2021", "33404378")],
  },
  {
    id: "C10",
    tier: "T5",
    plain:
      "Two or more weeks of short sleep with a falling weekly best: check sleep and consider a deload.",
    tierNote: PRACTICAL,
    cites: [],
  },
  {
    id: "C11",
    tier: "T5",
    plain:
      "Keep weekly hard sets per muscle inside a practical 10-20 range; add a set only after two weeks at target reps with 2+ reps in reserve.",
    tierNote:
      "The 12-20 core has low-certainty support; the 10 floor is a default.",
    cites: [
      c("Baz-Valle 2022", "35291645"),
      c("Camargo 2026", "42461790"),
      c("Schoenfeld 2019", "30153194"),
    ],
  },
  {
    id: "C12",
    tier: "T5",
    plain:
      "At 20 or more weekly sets with a stalled lift, consider trimming 1-2 sets.",
    tierNote: "Supports diminishing returns only.",
    cites: [c("Pelland 2026", "41343037")],
  },
  {
    id: "C13",
    tier: "T4",
    plain:
      "There is no per-session volume ceiling; the study usually cited for one was retracted.",
    tierNote: "A retraction, not a finding.",
    cites: [],
  },
  {
    id: "C14",
    tier: "T5",
    plain:
      "Deload form: half the sets (rounded down, at least 1 per exercise), same loads, 3-4 reps in reserve, same frequency.",
    tierNote: PRACTICAL,
    cites: [c("Rogerson 2024", "38499934")],
  },
  {
    id: "C15",
    tier: "T5",
    plain:
      "After 2+ weeks off, restart near 80-90% of previous loads and rebuild.",
    tierNote:
      "No trained-lifter trial of this figure; the one break studied was a week.",
    cites: [c("Coleman 2024", "38274324")],
  },
  {
    id: "C19",
    tier: "T5",
    plain:
      "Show pre-workout carbs next to performance, and only call it a pattern after 3+ sessions show the same link.",
    tierNote: PRACTICAL,
    cites: [],
  },
];

const BY_ID: ReadonlyMap<string, EvidenceRule> = new Map(
  EVIDENCE_RULES.map((r) => [r.id, r]),
);

export function evidenceRule(id: string): EvidenceRule | undefined {
  return BY_ID.get(id);
}

/** The weakest (highest-numbered) tier among the given rules; T5 when none. */
export function weakestTier(ids: readonly string[]): EvidenceTier {
  let worst = 0;
  for (const id of ids) {
    const r = BY_ID.get(id);
    if (r) worst = Math.max(worst, Number(r.tier.slice(1)));
  }
  return (worst ? `T${worst}` : "T5") as EvidenceTier;
}
