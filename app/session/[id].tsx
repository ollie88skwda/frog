import { useMemo, useReducer, useState } from "react";
import { ScrollView, TextInput, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen, Card, Mono } from "../../src/ui/primitives";
import { tokens as t } from "../../src/ui/tokens";
import { getDb } from "../../src/db/client";
import { listExercises } from "../../src/db/exercises";
import { addExerciseToSession, logSet, lastSetsForExercise } from "../../src/db/sessions";
import { reducer, ghostFor } from "../../src/domain/session-reducer";
import { toDisplayWeight, lbToKg } from "../../src/domain/units";

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = getDb();
  const exercises = useMemo(() => listExercises(db), [db]);
  const [exId, setExId] = useState<string | null>(null);
  const [seId, setSeId] = useState<string | null>(null);
  const prev = useMemo(() => (exId ? lastSetsForExercise(db, exId) : []), [db, exId]);
  const [state, dispatch] = useReducer(reducer, { sets: [] });

  const pick = (id2: string) => { setExId(id2); setSeId(addExerciseToSession(db, id as string, id2)); dispatch({ type: "addSet" }); };
  const commit = (i: number, w: string, r: string) => {
    const weightKg = w ? lbToKg(Number(w)) : null; const reps = r ? Number(r) : null;
    dispatch({ type: "editSet", index: i, patch: { weightKg, reps } });
    if (seId && weightKg != null && reps != null) logSet(db, seId, { weightKg, reps });
  };

  if (!exId) return (
    <Screen><Mono style={{ marginBottom: t.space[3], color: t.color.soft }}>Pick an exercise</Mono>
      <ScrollView>{exercises.map((e: any) => (
        <Pressable key={e.id} onPress={() => pick(e.id)}><Card style={{ marginBottom: t.space[2] }}><Mono>{e.name}</Mono></Card></Pressable>
      ))}</ScrollView></Screen>
  );

  return (
    <Screen>
      <ScrollView>
        {state.sets.map((s, i) => {
          const g = ghostFor(prev, i);
          return (
            <View key={i} style={{ flexDirection: "row", gap: t.space[2], marginBottom: t.space[2] }}>
              <Mono style={{ color: t.color.soft, width: 20 }}>{i + 1}</Mono>
              <TextInput keyboardType="numeric" placeholder={g.weightKg != null ? String(toDisplayWeight(g.weightKg, "lb")) : "lb"}
                placeholderTextColor={t.color.soft} onEndEditing={(e) => commit(i, e.nativeEvent.text, "")}
                style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.sm, padding: t.space[2], flex: 1 }} />
              <TextInput keyboardType="numeric" placeholder={g.reps != null ? String(g.reps) : "reps"}
                placeholderTextColor={t.color.soft} onEndEditing={(e) => commit(i, "", e.nativeEvent.text)}
                style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.sm, padding: t.space[2], flex: 1 }} />
            </View>
          );
        })}
        <Pressable onPress={() => dispatch({ type: "addSet" })}><Text style={{ color: t.color.accent }}>+ Add set</Text></Pressable>
      </ScrollView>
    </Screen>
  );
}
