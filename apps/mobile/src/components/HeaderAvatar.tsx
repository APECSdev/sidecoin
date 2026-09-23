// apps/mobile/src/components/HeaderAvatar.tsx
//
// The profile avatar rendered in the top-right of every stack screen header.
//
// Tapping it opens the Profile route (BitNames-managed public identity). It is
// deliberately a plain circle with a person glyph — the wallet has no avatar
// image source, and inventing one would misrepresent the account.
//
// WHY IT LIVES IN THE STACK HEADER ONLY: the four tab screens set
// `headerShown: false`, so they have no header to host an avatar. Profile stays
// reachable there via the FAB's "Profile" action, which is always present.

import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

import { ECASH, GRAY } from "../theme/colors";
import type { RootStackParamList } from "../navigation/types";

export function HeaderAvatar(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Profile"
      testID="header-avatar"
      onPress={() => navigation.navigate("profile")}
      style={styles.button}
    >
      <MaterialIcons name="person" size={20} color={ECASH[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: GRAY[700],
    backgroundColor: GRAY[900],
    marginRight: 8,
  },
});
