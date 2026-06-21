// App entry point. Normally this just delegates to expo-router/entry (the Expo
// default). When the bundle is built with EXPO_PUBLIC_E2E=1 (the headless web E2E
// suite), it instead loads the sql.js-backed E2E entry, which initialises an
// in-browser SQLite database before rendering the real app. EXPO_PUBLIC_* vars are
// inlined at build time, so the unused branch is stripped from production bundles.
if (process.env.EXPO_PUBLIC_E2E === "1") {
  require("./e2e/web/entry");
} else {
  require("expo-router/entry");
}
