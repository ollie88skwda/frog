import { useMemo, useReducer, useRef, useState } from "react";
import { FlatList, TextInput, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen, Card, Mono } from "../../src/ui/primitives";
import { tokens as t } from "../../src/ui/tokens";
import { getDb } from "../../src/db/client";
import { listExercises } from "../../src/db/exercises";
import { addExerciseToSession, logSet, lastSetsForExercise } from "../../src/db/sessions";
import { reducer, ghostFor, type DraftSet } from "../../src/domain/session-reducer";
import { toDisplayWeight, lbToKg } from "../../src/domain/units";

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = getDb();
  const exercises = useMemo(() => listExercises(db), [db]);
  const [exId, setExId] = useState<string | null>(null);
  const [seId, setSeId] = useState<string | null>(null);
  // Ghost prefill = the PRIOR session's sets. Exclude the current session-exercise
  // (created by pick() below), or the ghost would read the empty in-progress session.
  const prev = useMemo(
    () => (exId ? lastSetsForExercise(db, exId, seId ?? undefined) : []),
    [db, exId, seId]
  );
  const [state, dispatch] = useReducer(reducer, { sets: [] });
  const logged = useRef<Record<number, boolean>>({});
  const drafts = useRef<DraftSet[]>([]);

  const pick = (exerciseId: string) => {
    setExId(exerciseId);
    setSeId(addExerciseToSession(db, id as string, exerciseId));
    logged.current = {};
    drafts.current = [];
    dispatch({ type: "addSet" });
  };

  // onChangeText updates BOTH the reducer (for rendering) and a ref (read synchronously,
  // independent of React render timing). persist() — fired on blur AND endEditing, since
  // react-native-web ignores onEndEditing — logs a row once weight+reps are both present.
  // `logged` guards against double-writes.
  const setField = (i: number, patch: Partial<DraftSet>) => {
    const cur = drafts.current[i] ?? { weightKg: null, reps: null };
    drafts.current[i] = { ...cur, ...patch };
    dispatch({ type: "editSet", index: i, patch });
  };
  const persist = (i: number) => {
    const row = drafts.current[i];
    if (seId && row?.weightKg != null && row?.reps != null && !logged.current[i]) {
      logSet(db, seId, { weightKg: row.weightKg, reps: row.reps });
      logged.current[i] = true;
    }
  };

  if (!exId)
    return (
      <Screen>
        <Mono style={{ marginBottom: t.space[3], color: t.color.soft }}>Pick an exercise</Mono>
        <FlatList
          data={exercises}
          keyExtractor={(e: any) => e.id}
          renderItem={({ item }) => (
            <Pressable testID={`pick-exercise-${item.name}`} onPress={() => pick(item.id)}>
              <Card style={{ marginBottom: t.space[2] }}><Mono>{item.name}</Mono></Card>
            </Pressable>
          )}
        />
      </Screen>
    );

  return (
    <Screen>
      <FlatList
        data={state.sets}
        keyExtractor={(_, i) => String(i)}
        ListFooterComponent={
          <Pressable onPress={() => dispatch({ type: "addSet" })}>
            <Text style={{ color: t.color.accent }}>+ Add set</Text>
          </Pressable>
        }
        renderItem={({ index: i }) => {
          const g = ghostFor(prev, i);
          return (
            <View style={{ flexDirection: "row", gap: t.space[2], marginBottom: t.space[2] }}>
              <Mono style={{ color: t.color.soft, width: 20 }}>{i + 1}</Mono>
              <TextInput
                testID={`set-${i}-weight`}
                keyboardType="numeric"
                placeholder={g.weightKg != null ? String(toDisplayWeight(g.weightKg, "lb")) : "lb"}
                placeholderTextColor={t.color.soft}
                onChangeText={(text) => setField(i, { weightKg: text ? lbToKg(Number(text)) : null })}
                onEndEditing={() => persist(i)}
                onBlur={() => persist(i)}
                style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.sm, padding: t.space[2], flex: 1 }}
              />
              <TextInput
                testID={`set-${i}-reps`}
                keyboardType="numeric"
                placeholder={g.reps != null ? String(g.reps) : "reps"}
                placeholderTextColor={t.color.soft}
                onChangeText={(text) => setField(i, { reps: text ? Number(text) : null })}
                onEndEditing={() => persist(i)}
                onBlur={() => persist(i)}
                style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.sm, padding: t.space[2], flex: 1 }}
              />
            </View>
          );
        }}
      />
    </Screen>
  );
}
