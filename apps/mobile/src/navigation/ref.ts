// apps/mobile/src/navigation/ref.ts
//
// Shared navigation ref.
//
// A module-level ref lets code OUTSIDE the navigator tree (the root FAB) learn
// the focused route. The ref is attached to NavigationContainer in App.tsx and
// read/subscribed by RootNavigator.
//
// React Navigation's `onStateChange` prop belongs to NavigationContainer, not
// to a navigator, so this ref is the supported way for a sibling of the
// navigator to observe route changes.

import { createNavigationContainerRef } from "@react-navigation/native";

import type { RootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
