import { useCallback, useState } from "react";
import { FlatList, TextInput, Pressable, Text } from "react-native";
import { Screen, Card, Mono } from "../src/ui/primitives";
import { tokens as t } from "../src/ui/tokens";
import { getDb } from "../src/db/client";
import { listExercises, createExercise } from "../src/db/exercises";
import { useQueryFn } from "../src/db/use-live";

export default function Library() {
  const db = getDb();
  const [items, refetch] = useQueryFn(useCallback(() => listExercises(db), [db]));
  const [name, setName] = useState("");
  const add = () => { if (!name.trim()) return; createExercise(db, name.trim()); setName(""); refetch(); };
  return (
    <Screen>
      <TextInput testID="exercise-name-input" value={name} onChangeText={setName} placeholder="New exercise" placeholderTextColor={t.color.soft}
        onSubmitEditing={add}
        style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.md, padding: t.space[3], marginBottom: t.space[3] }} />
      <Pressable testID="add-exercise-btn" onPress={add}><Text style={{ color: t.color.accent, marginBottom: t.space[4] }}>+ Add exercise</Text></Pressable>
      <FlatList data={items} keyExtractor={(e: any) => e.id}
        renderItem={({ item }) => (<Card testID={`exercise-row-${item.name}`} style={{ marginBottom: t.space[2] }}><Mono>{item.name}</Mono></Card>)} />
    </Screen>
  );
}
