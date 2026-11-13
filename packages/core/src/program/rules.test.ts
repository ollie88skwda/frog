// Drift guard: PROGRAM_RULES must equal the "Machine-readable parameters"
// YAML block of PROGRAM-RULES.md (committed snapshot in fixtures/). Same
// pattern as scripts/check-mark-drift.ts. If this fails, the research moved:
// refresh fixtures/program-rules.yaml from
// /Users/Ollie/joe-frog/data/research/hypertrophy/PROGRAM-RULES.md and update
// rules.ts (prose rules win over the YAML).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { PROGRAM_RULES as R } from "./rules";

type Y = Record<string, Record<string, unknown>>;
const y = parse(
  readFileSync(
    new URL("./fixtures/program-rules.yaml", import.meta.url),
    "utf8",
  ),
) as Y;

describe("PROGRAM_RULES matches the research YAML", () => {
  it("R4 sessions per muscle", () =>
    expect(R.sessionsPerMuscleMin).toBe(y.R4.sessions_per_muscle_min));
  it("R7 indirect weight", () =>
    expect(R.indirectWeight).toBe(y.R7.indirect_set_weight));
  it("R7b direct sets per session", () =>
    expect([...R.directPerSession]).toEqual(y.R7b.direct_sets_per_session));
  it("C11 weekly band", () =>
    expect([...R.weeklySets]).toEqual(y.C11.weekly_hard_sets));
  it("C12 weekly cap and trim", () => {
    expect(R.weeklyCapSets).toBe(y.C12.weekly_cap_sets);
    expect([...R.trimSets]).toEqual(y.C12.trim_sets);
  });
  it("R8b reps", () => {
    expect([...R.repsMainCompound]).toEqual(y.R8b.reps_main_compound);
    expect([...R.repsMost]).toEqual(y.R8b.reps_main_most_sets);
    expect([...R.repsHeaviest]).toEqual(y.R8b.reps_heaviest_main);
    expect([...R.repsIsolation]).toEqual(y.R8b.reps_isolation);
  });
  it("R10 RIR", () => {
    expect([...R.rirDefault]).toEqual(y.R10.rir_default);
    expect([...R.rirLastIsolationSet]).toEqual(y.R10.rir_last_isolation_set);
  });
  it("C5 compound RIR floor", () =>
    expect(R.rirFloorCompound).toBe(y.C5.rir_floor_compound));
  it("R15 rest", () => {
    expect([...R.restAccessorySec]).toEqual(y.R15.rest_accessory_isolation_s);
    // YAML stores minutes ([2,3]); rules store seconds.
    expect(R.restHeavySec.map((s) => s / 60)).toEqual(
      y.R15.rest_heavy_multijoint_min,
    );
  });
  it("R17 deload", () => {
    expect(R.deloadSetFraction).toBe(y.R17.deload_set_fraction);
    expect([...R.deloadRir]).toEqual(y.R17.deload_rir);
    expect([...R.deloadIntervalWeeks]).toEqual(y.R17.deload_interval_weeks);
    expect(R.deloadDropPct).toBe(y.R17.deload_after_drop_pct);
    expect(R.deloadDropWeeks).toBe(y.R17.deload_after_drop_weeks);
  });
  it("R25 / C14 reactive trigger", () => {
    expect(R.deloadDropPct).toBe(y.R25.deload_trigger_e1rm_drop_pct);
    expect(R.deloadDropWeeks).toBe(y.R25.deload_trigger_consecutive_weeks);
    expect(R.deloadDropPct).toBe(y.C14.deload_trigger_e1rm_drop_pct);
  });
  it("R17b warm-up", () => {
    expect([...R.warmupFirstLift]).toEqual(y.R17b.warmup_first_lift_steps);
    expect([...R.warmupLaterLiftPct]).toEqual(y.R17b.warmup_later_lift_pct);
    expect(R.warmupLaterLiftSets).toBe(y.R17b.warmup_later_lift_sets);
  });
  it("R18b maintain share", () =>
    expect(R.maintainShare).toBe(y.R18b.group_mean_share_of_sets));
  it("C15 restart", () => {
    expect(R.restartGapDays).toBe(y["C2c-reset"].break_reset_days);
    expect(R.restartGapDays).toBe((y.C15.off_weeks_trigger as number) * 7);
    expect([...R.restartLoadPct]).toEqual(y.C15.restart_load_pct);
    expect(R.restartDefaultPct).toBeGreaterThanOrEqual(R.restartLoadPct[0]);
    expect(R.restartDefaultPct).toBeLessThanOrEqual(R.restartLoadPct[1]);
  });
});
