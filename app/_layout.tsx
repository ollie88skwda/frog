import { Tabs } from "expo-router";
import { getDb } from "../src/db/client";
getDb();
export default function RootLayout() {
  return (
    <Tabs screenOptions={{ tabBarStyle: { backgroundColor: "#0B1A2B", borderTopColor: "rgba(94,178,222,0.12)" },
      tabBarActiveTintColor: "#38BDF8", tabBarInactiveTintColor: "#84AACB",
      headerStyle: { backgroundColor: "#0B1A2B" }, headerTintColor: "#E3F0FB" }}>
      <Tabs.Screen name="index" options={{ title: "Train" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="session/[id]" options={{ href: null, title: "Session" }} />
    </Tabs>
  );
}
