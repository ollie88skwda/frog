// Dynamic Expo config. The real app config lives in app.json (single source of
// truth). This wrapper exists only so the E2E web build can opt into SPA output
// ("single") instead of static prerendering: static rendering runs each route in
// Node at build time, where the sql.js E2E client has no WASM available, so
// `getDb()` throws during prerender. SPA output skips the Node prerender and lets
// the browser entry initialise sql.js before the app renders.
//
// Normal builds (EXPO_PUBLIC_E2E unset) get app.json verbatim.
const appJson = require("./app.json");

module.exports = ({ config }) => {
  const base = { ...config, ...appJson.expo };
  if (process.env.EXPO_PUBLIC_E2E === "1") {
    return { ...base, web: { ...base.web, output: "single" } };
  }
  return base;
};
