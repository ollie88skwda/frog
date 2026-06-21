// Native variant of the E2E entry. The E2E suite is web-only (EXPO_PUBLIC_E2E is
// never set on native), but index.js statically `require("./e2e/web/entry")`, so
// Metro must resolve SOMETHING for native. Resolving this sql.js-free file keeps
// node:fs / sql.js out of the native (and dev) bundle. It is bundled but never
// executed on native — the else branch (expo-router/entry) runs there.
import "expo-router/entry";
