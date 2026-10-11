// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// @tanstack/react-query v5 ships an ESM "modern" build that uses internal
// relative .js imports Metro cannot resolve.  The package also exposes a
// "react-native" export condition that points to the raw TypeScript source,
// which Metro handles perfectly.  Adding the condition here makes Metro
// prefer that path instead of the ESM bundle.
config.resolver.unstable_conditionNames = [
  'react-native',
  'browser',
  'require',
];

module.exports = config;
