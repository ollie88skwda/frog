import { useMemo, useState } from "react";
import { CoachCard, EvidenceSheet } from "@/components/data";
import {
  liftSeries,
  liftVerdict,
  STATE_WORD,
} from "@/components/progress/derive";
import { useProgressData } from "@/components/progress/use-progress";

/**
 * Today coach read (boss request 2026-11-14): the lift you trained most
 * recently, as a best guess with a computed confidence %, from its second
 * logged session on. Low confidence reads as tentative, never as a fact.
 */
export function TodayCoachCard() {
  const d = useProgressData();
  const [why, setWhy] = useState(false);
  const pick = useMemo(() => {
    const sorted = [...d.history].sort((a, b) => b.startedAt - a.startedAt);
    const seen = new Set<string>();
    for (const s of sorted)
      for (const b of s.exercises) {
        if (b.exerciseType !== "weight_reps" || seen.has(b.exerciseId))
          continue;
        seen.add(b.exerciseId);
        const v = liftVerdict(liftSeries(d.history, b.exerciseId));
        if (v.kind === "status" && v.score && v.claim)
          return { id: b.exerciseId, v };
      }
    return null;
  }, [d.history]);
  if (pick?.v.kind !== "status" || !pick.v.score) return null;
  const { v } = pick;
  const score = v.score;
  if (!score) return null;
  const name = d.names.get(pick.id) ?? "Your lift";
  const word =
    v.claim === "up"
      ? "progressing"
      : v.claim === "down"
        ? "declining"
        : v.claim === "drop"
          ? "dipping"
          : "holding steady";
  const tentative = score.level === "low";
  const title = `${name}: ${tentative ? "maybe " : ""}${v.rough ? word : (STATE_WORD[v.status.state] ?? word).toLowerCase()}`;
  const reason = tentative
    ? `${score.pct}% confident, so take it as a first guess. ${score.raise}`
    : `${score.pct}% confident from ${score.n} sessions.`;
  return (
    <div className="mt-4" data-testid="today-coach-card">
      <CoachCard
        title={title}
        reason={reason}
        tier={5}
        score={score}
        onWhy={() => setWhy(true)}
      />
      <EvidenceSheet
        open={why}
        onOpenChange={setWhy}
        title={`How sure is this about ${name}?`}
        saw={<p className="num text-sm">{score.basis}</p>}
        ruleId="C2c"
        rule="A direction from your own e1RM history, with a confidence percentage computed from your sample size and scatter. A change under 10% reads as normal swing."
        tier={5}
        tierNote="Brzycki e1RM with RIR is an estimate (about ±1 rep). The percentage is a statistic on your own data, not a promise."
        confidence={score}
      />
    </div>
  );
}
