import { FlatList, Text, View } from "react-native";
import { Screen } from "../src/ui/primitives";
import { tokens as t } from "../src/ui/tokens";
import { getDb } from "../src/db/client";
import { useFindings } from "../src/db/use-findings";

const LINE_COLORS: Record<string, string> = {
  progress: t.color.pos,
  regressing: t.color.neg,
  plateau: t.color.soft,
  insufficient: t.color.soft,
  offdays: t.color.accent,
  dataissues: t.color.neg,
};

export default function FindingsScreen() {
  const db = getDb();
  const [summary] = useFindings(db);

  return (
    <Screen>
      <Text style={{ color: t.color.ink, marginBottom: t.space[4] }}>{summary.headline}</Text>
      <FlatList
        data={summary.lines}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ marginBottom: t.space[2] }}>
            <Text style={{ color: LINE_COLORS[item.type] ?? t.color.soft }}>{item.text}</Text>
          </View>
        )}
      />
    </Screen>
  );
}
