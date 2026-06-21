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

// E2E web build only (EXPO_PUBLIC_E2E=1): swap the SQLite client for a sql.js
// backed test client so the app can boot and persist headlessly in a browser
// (expo-sqlite's synchronous web API times out on boot). The E2E *entry* is
// selected by index.js (the package.json main), which initialises sql.js before
// rendering. App source is untouched; this alias is inert in every normal build.
if (process.env.EXPO_PUBLIC_E2E === "1") {
  const clientReal = path.resolve(__dirname, "src/db/client.ts");
  const clientTest = path.resolve(__dirname, "e2e/web/test-client.ts");
  const upstreamResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const def = (upstreamResolveRequest || context.resolveRequest)(
      context,
      moduleName,
      platform
    );
    if (def && def.type === "sourceFile" && def.filePath === clientReal) {
      return { ...def, filePath: clientTest };
    }
    return def;
  };
}

module.exports = config;
