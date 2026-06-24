import { useCallback, useState } from "react";
import { ScrollView, TextInput, Pressable, Text, View } from "react-native";
import { Screen, Card, Mono } from "../src/ui/primitives";
import { tokens as t } from "../src/ui/tokens";
import { getDb } from "../src/db/client";
import { listExercises, createExercise } from "../src/db/exercises";
import { createMetric, listMetrics } from "../src/db/metrics";
import { useQueryFn } from "../src/db/use-live";
import type { MetricType, MetricScope } from "../src/domain/conditions";

const METRIC_TYPES: MetricType[] = ["number", "scale", "text", "checkbox"];
const METRIC_SCOPES: MetricScope[] = ["session", "set"];

export default function Library() {
  const db = getDb();

  // Exercises
  const [exercises, refetchEx] = useQueryFn(useCallback(() => listExercises(db), [db]));
  const [exName, setExName] = useState("");
  const addExercise = () => {
    if (!exName.trim()) return;
    createExercise(db, exName.trim());
    setExName("");
    refetchEx();
  };

  // Metrics
  const [metrics, refetchMetrics] = useQueryFn(useCallback(() => listMetrics(db), [db]));
  const [mName, setMName] = useState("");
  const [mType, setMType] = useState<MetricType>("number");
  const [mScope, setMScope] = useState<MetricScope>("session");
  const addMetric = () => {
    if (!mName.trim()) return;
    createMetric(db, mName.trim(), mType, mScope);
    setMName("");
    refetchMetrics();
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Exercises */}
        <Text style={{ color: t.color.soft, marginBottom: t.space[2] }}>Exercises</Text>
        <TextInput
          value={exName}
          onChangeText={setExName}
          placeholder="New exercise name"
          placeholderTextColor={t.color.soft}
          onSubmitEditing={addExercise}
          style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.md, padding: t.space[3], marginBottom: t.space[2] }}
        />
        <Pressable onPress={addExercise}>
          <Text style={{ color: t.color.accent, marginBottom: t.space[4] }}>+ Add exercise</Text>
        </Pressable>
        {(exercises as any[]).map((e) => (
          <Card key={e.id} style={{ marginBottom: t.space[2] }}><Mono>{e.name}</Mono></Card>
        ))}

        {/* Metrics (session conditions + set metrics) */}
        <Text style={{ color: t.color.soft, marginTop: t.space[5], marginBottom: t.space[2] }}>
          Conditions & custom metrics
        </Text>
        <TextInput
          value={mName}
          onChangeText={setMName}
          placeholder="Metric name (e.g. Sleep)"
          placeholderTextColor={t.color.soft}
          onSubmitEditing={addMetric}
          style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.md, padding: t.space[3], marginBottom: t.space[2] }}
        />
        {/* Type selector */}
        <View style={{ flexDirection: "row", gap: t.space[2], marginBottom: t.space[2] }}>
          {METRIC_TYPES.map((tp) => (
            <Pressable
              key={tp}
              onPress={() => setMType(tp)}
              style={{ borderWidth: 1, borderColor: mType === tp ? t.color.accent : t.color.line, borderRadius: t.radius.sm, paddingHorizontal: t.space[2], paddingVertical: t.space[1] }}
            >
              <Text style={{ color: mType === tp ? t.color.accent : t.color.soft, fontSize: 12 }}>{tp}</Text>
            </Pressable>
          ))}
        </View>
        {/* Scope selector */}
        <View style={{ flexDirection: "row", gap: t.space[2], marginBottom: t.space[2] }}>
          {METRIC_SCOPES.map((sc) => (
            <Pressable
              key={sc}
              onPress={() => setMScope(sc)}
              style={{ borderWidth: 1, borderColor: mScope === sc ? t.color.accent : t.color.line, borderRadius: t.radius.sm, paddingHorizontal: t.space[2], paddingVertical: t.space[1] }}
            >
              <Text style={{ color: mScope === sc ? t.color.accent : t.color.soft, fontSize: 12 }}>
                {sc === "session" ? "session" : "per set"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={addMetric}>
          <Text style={{ color: t.color.accent, marginBottom: t.space[4] }}>+ Add metric</Text>
        </Pressable>
        {(metrics as any[]).map((m) => (
          <Card key={m.id} style={{ marginBottom: t.space[2] }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Mono>{m.name}</Mono>
              <Text style={{ color: t.color.soft, fontSize: 12 }}>{m.type} · {m.scope}</Text>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
