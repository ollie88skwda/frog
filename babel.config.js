// Babel config for Expo.
// `inline-import` inlines drizzle's generated `.sql` migration files as strings
// at build time, which (together with the `.sql` source ext in metro.config.js)
// is what lets the expo-sqlite migrator import `./0000_*.sql`.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [["inline-import", { extensions: [".sql"] }]],
  };
};
