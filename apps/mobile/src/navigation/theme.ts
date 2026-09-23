// apps/mobile/src/navigation/theme.ts
//
// React Navigation theme for the Sidecoin wallet.
//
// WHY THIS FILE EXISTS: React Navigation's built-in `DefaultTheme` is a LIGHT
// theme — its `colors.background` is `rgb(242, 242, 242)` and `colors.card` is
// white. That theme is what `NavigationContainer` applies to the area between
// and around screens (including the left/right gutters exposed while a screen
// transitions). Before this file existed, `App.tsx` passed no `theme` prop, so
// the app rendered those gutters in `rgb(242, 242, 242)` — the white border
// visible in dark mode.
//
// This is a display-only theme. Like `apps/wallet/src/theme.ts` it must never
// affect signing, addresses, balances, transaction construction, entitlement
// checks, swaps, coin splitting, settlement, or broadcast.
//
// The palette reuses the same constants as every other RN surface
// (`./colors.ts`), so the shell and the screens cannot drift apart.

import { DarkTheme, type Theme } from "@react-navigation/native";
import { SC, GRAY } from "../theme/colors";

/**
 * Dark navigation theme built on top of React Navigation's `DarkTheme` so we
 * inherit the correct `fonts` and `dark: true` flag, then override every color
 * with the Sidecoin palette.
 *
 *   background — the navigator gutter / screen-transition backdrop (SC.bg)
 *   card       — headers, tab bar, and card surfaces     (SC.bg)
 *   text       — default title/header text               (SC.text)
 *   border     — header + tab-bar separators             (GRAY[800])
 *   primary    — active tint                             (SC.primary)
 */
export const navigationTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: SC.primary,
    background: SC.bg,
    card: SC.bg,
    text: SC.text,
    border: GRAY[800],
    notification: SC.danger,
  },
};