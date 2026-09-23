// apps/mobile/src/screens/ProBenefitsScreen.tsx
//
// Ported 1:1 from apps/wallet/src/views/ProBenefitsView.vue.
//
// All copy, the five benefit lists, and the four PRO highlights are carried
// over verbatim. Two platform substitutions:
//   • `<a href="https://sidecoin.app/pro">` → Linking.openURL (same URL).
//   • `<router-link to="/platforms">` → navigation.navigate("main") is not
//     reachable from a stack screen as a tab jump, so the primary stack
//     navigator's parent tab list is targeted via getParent(). The Vue target
//     was the /platforms route, which is the "platforms" tab here.

import React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ECASH, GRAY } from "../theme/colors";
import type { RootStackParamList } from "../navigation/types";
import { Body, Button, Card, Eyebrow, Muted, Title } from "../components/ui";

const UPGRADE_URL = "https://sidecoin.app/pro";

const platformBenefits = [
  "Unlock zSide, BitAssets, Photon, Truthcoin, CoinShift, and RISCy",
  "Early access to proposed platforms like RISCy",
  "Premium platform dashboards and guided workflows",
  "Advanced platform-specific safety checks",
];

const walletBenefits = [
  "Historical portfolio analysis across platforms",
  "Advanced transaction review and wallet insights",
  "Hardware signing workflows for supported devices",
  "Priority access to new Drivechain features",
];

const basicIncludes = [
  "L1 wallet",
  "Thunder payments",
  "BitNames identity registration",
  "Swap access",
  "Coin Split Helper",
];

const proHighlights = [
  {
    title: "All Platforms",
    body:
      "Move beyond Basic access and unlock the full Drivechains Financial Hub.",
  },
  {
    title: "Historical Analysis",
    body:
      "Track activity, balances, and performance across L1 and every platform.",
  },
  {
    title: "Early Access",
    body:
      "Get first access to proposed and experimental platforms, including RISCy.",
  },
  {
    title: "Hardware Power Tools",
    body:
      "Use advanced hardware wallet workflows as signing support rolls out.",
  },
];

const founderEligibility = [
  {
    title: "Monthly PRO",
    body:
      "Unlocks Sidecoin PRO wallet features. Monthly subscriptions do not qualify for Founder Leaderboard placement or Alpha Circle eligibility.",
  },
  {
    title: "Yearly PRO",
    body:
      "Unlocks Sidecoin PRO wallet features and qualifies for Founder Leaderboard placement and Alpha Circle eligibility.",
  },
];

export function ProBenefitsScreen(): React.JSX.Element {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  function openUpgrade(): void {
    void Linking.openURL(UPGRADE_URL);
  }

  function openPlatforms(): void {
    // "/platforms" is the "platforms" tab inside the tab shell ("main").
    navigation.navigate("main", { screen: "platforms" });
  }

  return (
    <View style={styles.root}>
      <Card tone="pro" style={styles.hero}>
        <Eyebrow style={styles.heroEyebrow}>Sidecoin PRO</Eyebrow>
        <Text style={styles.heroTitle}>
          Unlock the full Drivechains Financial Hub
        </Text>
        <Body style={styles.heroBody}>
          Basic gives you L1, Thunder, BitNames, Swap, and Coin Split tools.
          PRO unlocks the complete platform experience, historical analysis,
          advanced hardware workflows, and early access to proposed platforms.
        </Body>

        <View style={styles.heroCtas}>
          <Button label="Upgrade to PRO" variant="pro" onPress={openUpgrade} />
          <Button
            label="Explore platforms"
            variant="secondary"
            onPress={openPlatforms}
          />
        </View>
      </Card>

      <View style={styles.highlights}>
        {proHighlights.map((item) => (
          <Card key={item.title} tone="surface" style={styles.highlight}>
            <Text style={styles.highlightTitle}>{item.title}</Text>
            <Muted style={styles.highlightBody}>{item.body}</Muted>
          </Card>
        ))}
      </View>

      <Card tone="pro" style={styles.founder}>
        <Eyebrow style={styles.amberEyebrow}>Founder eligibility</Eyebrow>
        <Text style={styles.founderTitle}>
          Leaderboard and Alpha Circle require Yearly PRO
        </Text>
        <Body style={styles.founderBody}>
          Monthly PRO unlocks Sidecoin PRO wallet features. Yearly PRO unlocks
          those features and qualifies for Founder Leaderboard placement and
          Alpha Circle eligibility.
        </Body>

        <View style={styles.founderGrid}>
          {founderEligibility.map((item) => (
            <Card key={item.title} tone="inset" style={styles.founderTile}>
              <Text style={styles.founderTileTitle}>{item.title}</Text>
              <Muted style={styles.founderTileBody}>{item.body}</Muted>
            </Card>
          ))}
        </View>
      </Card>

      <View style={styles.columns}>
        <Card style={styles.column}>
          <Text style={styles.columnTitle}>Basic includes</Text>
          <View style={styles.list}>
            {basicIncludes.map((item) => (
              <View key={item} style={styles.listItem}>
                <Text style={styles.checkGreen}>✓</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card tone="pro" style={styles.column}>
          <Text style={styles.columnTitleAmber}>PRO platforms</Text>
          <View style={styles.list}>
            {platformBenefits.map((item) => (
              <View key={item} style={styles.listItem}>
                <Text style={styles.checkAmber}>✓</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card tone="pro" style={styles.column}>
          <Text style={styles.columnTitleAmber}>PRO wallet tools</Text>
          <View style={styles.list}>
            {walletBenefits.map((item) => (
              <View key={item} style={styles.listItem}>
                <Text style={styles.checkAmber}>✓</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 28,
  },
  hero: {
    padding: 28,
  },
  heroEyebrow: {
    color: "#fbbf24",
    letterSpacing: 3,
  },
  heroTitle: {
    marginTop: 16,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.5,
    color: "#ffffff",
  },
  heroBody: {
    marginTop: 16,
    fontSize: 16,
    lineHeight: 26,
  },
  heroCtas: {
    marginTop: 28,
    gap: 12,
  },
  highlights: {
    gap: 16,
  },
  highlight: {
    padding: 20,
  },
  highlightTitle: {
    fontWeight: "700",
    color: "#ffffff",
  },
  highlightBody: {
    marginTop: 8,
    lineHeight: 20,
  },
  founder: {
    padding: 24,
  },
  amberEyebrow: {
    color: "#fbbf24",
    letterSpacing: 2.5,
  },
  founderTitle: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: "900",
    color: "#ffffff",
  },
  founderBody: {
    marginTop: 12,
    fontSize: 13,
  },
  founderGrid: {
    marginTop: 20,
    gap: 16,
  },
  founderTile: {
    padding: 16,
  },
  founderTileTitle: {
    fontWeight: "900",
    color: "#ffffff",
  },
  founderTileBody: {
    marginTop: 8,
    lineHeight: 20,
  },
  columns: {
    gap: 24,
  },
  column: {
    padding: 24,
  },
  columnTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  columnTitleAmber: {
    fontSize: 20,
    fontWeight: "900",
    color: "#fbbf24",
  },
  list: {
    marginTop: 20,
    gap: 12,
  },
  listItem: {
    flexDirection: "row",
    gap: 8,
  },
  checkGreen: {
    color: ECASH[400],
  },
  checkAmber: {
    color: "#fbbf24",
  },
  listText: {
    flexShrink: 1,
    fontSize: 13,
    color: GRAY[300],
  },
});
