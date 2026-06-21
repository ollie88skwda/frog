import { View, Text, ViewProps, TextProps } from "react-native";
import { tokens as t } from "./tokens";

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: t.color.bg, padding: t.space[4] }}>{children}</View>;
}
export function Card(props: ViewProps) {
  return <View {...props} style={[{ backgroundColor: t.color.surface, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.lg, padding: t.space[4] }, props.style]} />;
}
export function Mono(props: TextProps) {
  return <Text {...props} style={[{ color: t.color.ink, fontVariant: ["tabular-nums"] }, props.style]} />;
}
