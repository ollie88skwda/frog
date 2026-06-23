import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { tokens as t } from "./tokens";
import { listMetricsByScope, saveSessionConditionValues } from "../db/metrics";
import { getSessionConditionValues } from "../db/metrics";
import { validateConditionValue } from "../domain/conditions";
import type { ConditionMap } from "../domain/conditions";

type Props = { db: any; sessionId: string };

export function SessionConditionsEntry({ db, sessionId }: Props) {
  const [metrics] = useState(() => listMetricsByScope(db, "session"));
  const [values, setValues] = useState<ConditionMap>(() => getSessionConditionValues(db, sessionId));

  if (metrics.length === 0) return null;

  const save = (next: ConditionMap) => {
    setValues(next);
    saveSessionConditionValues(db, sessionId, next);
  };

  return (
    <View style={{ marginBottom: t.space[3] }}>
      <Text style={{ color: t.color.soft, marginBottom: t.space[2] }}>Session conditions</Text>
      {metrics.map((m: any) => {
        const current = values[m.id];
        if (m.type === "checkbox") {
          return (
            <Pressable
              key={m.id}
              onPress={() => save({ ...values, [m.id]: !current })}
              style={{ marginBottom: t.space[1] }}
            >
              <Text style={{ color: current ? t.color.accent : t.color.soft }}>
                {m.name}: {current ? "yes" : "no"}
              </Text>
            </Pressable>
          );
        }
        return (
          <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: t.space[2], marginBottom: t.space[1] }}>
            <Text style={{ color: t.color.soft, flex: 1 }}>{m.name}</Text>
            <TextInput
              keyboardType={m.type === "text" ? "default" : "numeric"}
              defaultValue={current != null ? String(current) : ""}
              placeholder={m.type === "scale" ? "1–10" : ""}
              placeholderTextColor={t.color.soft}
              onEndEditing={(e) => {
                const raw = e.nativeEvent.text.trim();
                if (!raw) return;
                const parsed: unknown = m.type === "text" ? raw : Number(raw);
                const valid = validateConditionValue(m.type, parsed);
                if (valid !== null) save({ ...values, [m.id]: valid });
              }}
              style={{
                color: t.color.ink,
                borderColor: t.color.line,
                borderWidth: 1,
                borderRadius: t.radius.sm,
                padding: t.space[2],
                width: 80,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}
