import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/ui/primitives";
import { tokens as t } from "../src/ui/tokens";
import { getDb } from "../src/db/client";
import { startSession } from "../src/db/sessions";

export default function Train() {
  const router = useRouter();
  const begin = () => { const id = startSession(getDb(), "Session"); router.push(`/session/${id}`); };
  return (
    <Screen>
      <Pressable testID="start-session-btn" onPress={begin} style={{ backgroundColor: t.color.accent, borderRadius: t.radius.lg, padding: t.space[4] }}>
        <Text style={{ color: t.color.bg, fontWeight: "700", textAlign: "center" }}>Start session</Text>
      </Pressable>
    </Screen>
  );
}
