import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { tokens as t } from "./tokens";
import { listMetricsByScope, saveSetMetricValues } from "../db/metrics";
import { validateConditionValue } from "../domain/conditions";
import type { ConditionMap } from "../domain/conditions";

type Props = { db: any; setLogId: string };

/**
 * Inline set-level metric entry row. Renders one input per set-scope metric.
 * Only mounts once a set has been logged (setLogId must be a real row id).
 */
export function SetMetricEntry({ db, setLogId }: Props) {
  const [metrics] = useState(() => listMetricsByScope(db, "set"));
  const [values, setValues] = useState<ConditionMap>({});

  if (metrics.length === 0) return null;

  const save = (next: ConditionMap) => {
    setValues(next);
    saveSetMetricValues(db, setLogId, next);
  };

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space[1], marginTop: t.space[1], marginLeft: t.space[5] }}>
      {metrics.map((m: any) => {
        const current = values[m.id];
        if (m.type === "checkbox") {
          return (
            <Pressable
              key={m.id}
              onPress={() => save({ ...values, [m.id]: !current })}
            >
              <Text style={{ color: current ? t.color.accent : t.color.soft, fontSize: 12 }}>
                {m.name}: {current ? "✓" : "—"}
              </Text>
            </Pressable>
          );
        }
        return (
          <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: t.space[1] }}>
            <Text style={{ color: t.color.soft, fontSize: 12 }}>{m.name}</Text>
            <TextInput
              keyboardType={m.type === "text" ? "default" : "numeric"}
              defaultValue={current != null ? String(current) : ""}
              placeholder={m.type === "scale" ? "1-10" : ""}
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
                paddingHorizontal: t.space[2],
                paddingVertical: t.space[1],
                width: 56,
                fontSize: 12,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}
