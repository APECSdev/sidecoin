// apps/mobile/src/buildFlavor.fdroid.ts
//
// Build-flavor flag — FDROID variant. metro.config.js maps the
// "./buildFlavor" specifier to this file only while bundling the fdroid
// flavor. F-Droid builds ship every platform and feature free of charge:
// no paid tier, no upgrade CTA, no PRO mention anywhere in the UI.
// See src/entitlements.ts for the entitlement switch this drives.

export const IS_FDROID_BUILD = true;
