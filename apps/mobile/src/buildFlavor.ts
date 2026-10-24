// apps/mobile/src/buildFlavor.ts
//
// Build-flavor flag — BASE module (appstore, dev, Jest).
//
// metro.config.js redirects this specifier to ./buildFlavor.fdroid ONLY when
// bundling the `fdroid` Android flavor (same resolveRequest seam that maps
// @sentry/react-native to the no-op shim). Every other context — appstore,
// `react-native start`, Jest — resolves this base file, so the default below
// MUST stay false.
//
// Consumed by src/entitlements.ts to decide whether the app ships with the
// hardcoded Basic plan (appstore) or with every feature unlocked and no
// paid tier at all (fdroid). Added for v26.10.22 after junkerderprovinz's
// review on fdroiddata!50457 (note 4064134145).

export const IS_FDROID_BUILD = false;
