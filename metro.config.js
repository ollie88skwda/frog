// Metro configuration for Expo.
// Drizzle's expo-sqlite migrator imports the generated migration as a `.sql`
// module (drizzle/migrations.js -> ./0000_*.sql). Metro doesn't bundle `.sql`
// by default, so register it as a source extension or the app fails to bundle.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push("sql");

// expo-sqlite on web (wa-sqlite) imports a `.wasm` module. Metro doesn't treat
// `.wasm` as an asset by default, so the web bundle fails to resolve it. Register
// it as an asset extension so the web target (used by the Playwright E2E suite)
// can bundle. No effect on native, where SQLite is provided by the OS.
config.resolver.assetExts.push("wasm");

// Two resolver concerns, handled in one hook:
//  1) NATIVE must never pull the web-only sql.js driver — it does require("node:fs"),
//     which Metro can't resolve for iOS/Android. The E2E suite is web-only, so on
//     non-web platforms resolve sql.js (and any node: builtin) to an EMPTY module.
//     This is the hard guarantee that `expo start` for a device/simulator stays clean,
//     regardless of dev-mode dead-code elimination.
//  2) E2E web build only (EXPO_PUBLIC_E2E=1): swap the real expo-sqlite client for the
//     sql.js-backed test client so the app boots/persists headlessly in a browser.
const isE2E = process.env.EXPO_PUBLIC_E2E === "1";
const clientReal = path.resolve(__dirname, "src/db/client.ts");
const clientTest = path.resolve(__dirname, "e2e/web/test-client.ts");
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== "web" && (moduleName === "sql.js" || moduleName.startsWith("node:"))) {
    return { type: "empty" };
  }
  const def = (defaultResolveRequest || context.resolveRequest)(context, moduleName, platform);
  if (isE2E && def && def.type === "sourceFile" && def.filePath === clientReal) {
    return { ...def, filePath: clientTest };
  }
  return def;
};

module.exports = config;
