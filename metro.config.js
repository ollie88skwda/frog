// Metro configuration for Expo.
// Drizzle's expo-sqlite migrator imports the generated migration as a `.sql`
// module (drizzle/migrations.js -> ./0000_*.sql). Metro doesn't bundle `.sql`
// by default, so register it as a source extension or the app fails to bundle.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push("sql");

module.exports = config;
