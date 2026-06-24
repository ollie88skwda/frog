import { useCallback } from "react";
import { FlatList, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen, Card, Mono } from "../src/ui/primitives";
import { tokens as t } from "../src/ui/tokens";
import { getDb } from "../src/db/client";
import { useFindings } from "../src/db/use-findings";
import type { ExerciseFinding } from "../src/domain/findings";

const VERDICT_COLOR: Record<string, string> = {
  PROGRESSING: t.color.pos,
  PLATEAU: t.color.soft,
  REGRESSING: t.color.neg,
  INSUFFICIENT: t.color.soft,
};

const LINE_COLOR: Record<string, string> = {
  progress: t.color.pos,
  regressing: t.color.neg,
  plateau: t.color.soft,
  insufficient: t.color.soft,
  offdays: t.color.accent,
  dataissues: t.color.neg,
};

function ExerciseRow({ name, finding }: { name: string; finding: ExerciseFinding }) {
  const color = VERDICT_COLOR[finding.verdict] ?? t.color.soft;
  const change =
    finding.verdict !== "INSUFFICIENT"
      ? ` ${finding.pctChange >= 0 ? "+" : ""}${finding.pctChange.toFixed(1)}%`
      : "";
  const rate =
    finding.verdict === "PROGRESSING" || finding.verdict === "REGRESSING"
      ? ` (${finding.perMonth >= 0 ? "+" : ""}${finding.perMonth.toFixed(1)} e1RM/mo)`
      : "";
  return (
    <Card style={{ marginBottom: t.space[2] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Mono style={{ flex: 1, color: t.color.ink }} numberOfLines={1}>{name}</Mono>
        <Text style={{ color, marginLeft: t.space[2] }}>{finding.verdict}</Text>
      </View>
      <Text style={{ color: t.color.soft, fontSize: 12, marginTop: t.space[1] }}>
        {finding.n} session{finding.n === 1 ? "" : "s"}{change}{rate}
      </Text>
    </Card>
  );
}

export default function FindingsScreen() {
  const db = getDb();
  const [{ summary, report }, refetch] = useFindings(db);

  // Auto-refresh whenever the tab comes into focus.
  useFocusEffect(useCallback(() => { refetch(); }, []));

  const exerciseEntries = Object.entries(report.findings).sort((a, b) => {
    // Sort: PROGRESSING first, then PLATEAU, REGRESSING, INSUFFICIENT
    const order = { PROGRESSING: 0, PLATEAU: 1, REGRESSING: 2, INSUFFICIENT: 3 };
    return (order[a[1].verdict] ?? 4) - (order[b[1].verdict] ?? 4);
  });

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Headline */}
        <Text style={{ color: t.color.ink, fontWeight: "700", marginBottom: t.space[3] }}>
          {summary.headline}
        </Text>

        {/* Summary lines */}
        {summary.lines.map((line, i) => (
          <Text
            key={i}
            style={{ color: LINE_COLOR[line.type] ?? t.color.soft, marginBottom: t.space[2] }}
          >
            {line.text}
          </Text>
        ))}

        {/* Per-exercise breakdown */}
        {exerciseEntries.length > 0 && (
          <>
            <Text style={{ color: t.color.soft, marginTop: t.space[4], marginBottom: t.space[2] }}>
              Per lift
            </Text>
            {exerciseEntries.map(([name, finding]) => (
              <ExerciseRow key={name} name={name} finding={finding} />
            ))}
          </>
        )}

        {/* Off-day flags */}
        {report.offDays.length > 0 && (
          <>
            <Text style={{ color: t.color.soft, marginTop: t.space[4], marginBottom: t.space[2] }}>
              Flagged off days
            </Text>
            {report.offDays.map((d, i) => (
              <Card key={i} style={{ marginBottom: t.space[2] }}>
                <Mono style={{ color: t.color.accent }}>Day {d.sessionDay}</Mono>
                <Text style={{ color: t.color.soft, fontSize: 12, marginTop: t.space[1] }}>
                  avg {d.avgDevPct.toFixed(1)}% vs norm ({d.exercisesChecked} lifts checked)
                </Text>
              </Card>
            ))}
          </>
        )}

        {/* Data issues */}
        {(report.weightOutliers.length > 0 || report.spikeReverts.length > 0) && (
          <>
            <Text style={{ color: t.color.soft, marginTop: t.space[4], marginBottom: t.space[2] }}>
              Data quality flags
            </Text>
            {report.weightOutliers.map((w, i) => (
              <Card key={`wo-${i}`} style={{ marginBottom: t.space[2] }}>
                <Mono style={{ color: t.color.neg }}>{w.exercise}</Mono>
                <Text style={{ color: t.color.soft, fontSize: 12, marginTop: t.space[1] }}>
                  {w.weightKg} kg (median {w.medianKg.toFixed(1)}, z={w.zScore.toFixed(1)}) — possible unit typo
                </Text>
              </Card>
            ))}
            {report.spikeReverts.map((s, i) => (
              <Card key={`sr-${i}`} style={{ marginBottom: t.space[2] }}>
                <Mono style={{ color: t.color.neg }}>{s.exercise}</Mono>
                <Text style={{ color: t.color.soft, fontSize: 12, marginTop: t.space[1] }}>
                  Spike: {s.prevE1rm.toFixed(0)} → {s.spikeE1rm.toFixed(0)} → {s.nextE1rm.toFixed(0)} e1RM — likely bad entry
                </Text>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
