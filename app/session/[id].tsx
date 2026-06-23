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
import { SessionConditionsEntry } from "../../src/ui/SessionConditionsEntry";

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = getDb();
  const exercises = useMemo(() => listExercises(db), [db]);
  const [exId, setExId] = useState<string | null>(null);
  const [seId, setSeId] = useState<string | null>(null);
  const prev = useMemo(() => (exId ? lastSetsForExercise(db, exId) : []), [db, exId]);
  const [state, dispatch] = useReducer(reducer, { sets: [] });
  const logged = useRef<Record<number, boolean>>({});

  const pick = (exerciseId: string) => {
    setExId(exerciseId);
    setSeId(addExerciseToSession(db, id as string, exerciseId));
    logged.current = {};
    dispatch({ type: "addSet" });
  };

  // Merge the edited field with the row's existing draft, then persist once BOTH
  // weight and reps are present. The two inputs fire independently, so we read the
  // current row from reducer state instead of trusting a single event. `logged`
  // guards against double-writing the same row.
  const onField = (i: number, patch: Partial<DraftSet>) => {
    dispatch({ type: "editSet", index: i, patch });
    const merged = { ...state.sets[i], ...patch };
    if (seId && merged.weightKg != null && merged.reps != null && !logged.current[i]) {
      logSet(db, seId, { weightKg: merged.weightKg, reps: merged.reps });
      logged.current[i] = true;
    }
  };

  if (!exId)
    return (
      <Screen>
        <SessionConditionsEntry db={db} sessionId={id as string} />
        <Mono style={{ marginBottom: t.space[3], color: t.color.soft }}>Pick an exercise</Mono>
        <FlatList
          data={exercises}
          keyExtractor={(e: any) => e.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => pick(item.id)}>
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
                keyboardType="numeric"
                placeholder={g.weightKg != null ? String(toDisplayWeight(g.weightKg, "lb")) : "lb"}
                placeholderTextColor={t.color.soft}
                onEndEditing={(e) => onField(i, { weightKg: e.nativeEvent.text ? lbToKg(Number(e.nativeEvent.text)) : null })}
                style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.sm, padding: t.space[2], flex: 1 }}
              />
              <TextInput
                keyboardType="numeric"
                placeholder={g.reps != null ? String(g.reps) : "reps"}
                placeholderTextColor={t.color.soft}
                onEndEditing={(e) => onField(i, { reps: e.nativeEvent.text ? Number(e.nativeEvent.text) : null })}
                style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.sm, padding: t.space[2], flex: 1 }}
              />
            </View>
          );
        }}
      />
    </Screen>
  );
}
