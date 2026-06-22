import type { HolisticReport, ExerciseFinding } from "./findings";

export type SummaryLineType = "progress" | "plateau" | "regressing" | "insufficient" | "offdays" | "dataissues";

export type SummaryLine = {
  type: SummaryLineType;
  text: string;
};

export type ProgressionSummary = {
  lines: SummaryLine[];
  headline: string;
};

/** Returns structured human-readable strings from a HolisticReport. */
export function summarizeReport(report: HolisticReport): ProgressionSummary {
  const verdicts = Object.values(report.findings);
  const progressing = verdicts.filter((f) => f.verdict === "PROGRESSING");
  const plateauing = verdicts.filter((f) => f.verdict === "PLATEAU");
  const regressing = verdicts.filter((f) => f.verdict === "REGRESSING");
  const insufficient = verdicts.filter((f) => f.verdict === "INSUFFICIENT");
  const total = verdicts.length;

  if (total === 0) {
    return {
      lines: [{ type: "insufficient", text: "No exercises tracked yet. Log at least 5 sessions per lift to see findings." }],
      headline: "Not enough data yet.",
    };
  }

  const lines: SummaryLine[] = [];

  if (progressing.length > 0) {
    lines.push({
      type: "progress",
      text: `Making progress on ${progressing.length} of ${total} tracked lift${total === 1 ? "" : "s"}.`,
    });
  }
  if (plateauing.length > 0) {
    const n = plateauing.length;
    lines.push({
      type: "plateau",
      text: `${n} lift${n === 1 ? " is" : "s are"} at a plateau — consider varying intensity or volume.`,
    });
  }
  if (regressing.length > 0) {
    const n = regressing.length;
    lines.push({
      type: "regressing",
      text: `${n} lift${n === 1 ? " shows" : "s show"} regression — check recovery, form, or add a deload.`,
    });
  }
  if (insufficient.length > 0) {
    const n = insufficient.length;
    lines.push({
      type: "insufficient",
      text: `${n} lift${n === 1 ? " needs" : "s need"} more data (at least 5 sessions each).`,
    });
  }
  if (report.offDays.length > 0) {
    const n = report.offDays.length;
    lines.push({
      type: "offdays",
      text: `${n} session${n === 1 ? "" : "s"} flagged as possible off days — consider logging sleep and stress.`,
    });
  }
  const dataIssues = report.weightOutliers.length + report.spikeReverts.length;
  if (dataIssues > 0) {
    lines.push({
      type: "dataissues",
      text: `${dataIssues} potential data entry error${dataIssues === 1 ? "" : "s"} detected — check flagged weights.`,
    });
  }

  let headline: string;
  if (progressing.length > 0 && regressing.length === 0) {
    headline = `Looking good — ${progressing.length} of ${total} lift${total === 1 ? "" : "s"} progressing.`;
  } else if (regressing.length > 0 && progressing.length === 0) {
    const n = regressing.length;
    headline = `${n} lift${n === 1 ? "" : "s"} regressing — action may be needed.`;
  } else if (regressing.length > 0) {
    headline = `Mixed results: ${progressing.length} progressing, ${regressing.length} regressing.`;
  } else if (plateauing.length === total) {
    headline = "All lifts at a plateau — time to shake things up.";
  } else {
    headline = `${total} lift${total === 1 ? "" : "s"} tracked.`;
  }

  return { lines, headline };
}

/**
 * Returns how many more sessions the user needs before any INSUFFICIENT lift
 * produces a real verdict. Returns 0 when all lifts already have a verdict.
 */
export function sessionsUntilFirstFinding(findings: Record<string, ExerciseFinding>): number {
  const insufficient = Object.values(findings).filter((f) => f.verdict === "INSUFFICIENT");
  if (insufficient.length === 0) return 0;
  const minLogged = Math.min(...insufficient.map((f) => f.n));
  return Math.max(0, 5 - minLogged);
}
