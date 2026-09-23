// apps/mobile/src/screens/ExploreScreen.tsx
//
// MOCK — the "Explore" bottom tab.
//
// SCOPE NOTE (requested by the operator): the real screen is a Web3-enabled
// in-app browser. This file is a MOCK: it renders the browser chrome (address
// bar, back/forward/reload, a dApp grid) with static, clearly-labelled sample
// data. There is NO WebView, NO wallet-connect bridge, and NO RPC client
// wired here.
//
// The data below is explicitly labelled as sample content in the UI so the
// screen never presents fabricated activity as real.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GRAY } from "../theme/colors";
import {
  Badge,
  Body,
  Card,
  Eyebrow,
  Field,
  Mono,
  Muted,
  Screen,
  Subtitle,
  Title,
} from "../components/ui";

/** A bookmarked dApp destination. */
interface ExploreSite {
  /** Display name of the dApp. */
  name: string;
  /** Host shown in the address bar. */
  host: string;
  /** One-line description. */
  description: string;
}

/**
 * Static sample destinations. Every value here is a literal — nothing is
 * resolved or fetched. It exists to exercise the layout (an address bar plus a
 * browsable grid), not to represent real dApps.
 */
const SAMPLE_SITES: ExploreSite[] = [
  {
    name: "BitNames",
    host: "bitnames.app",
    description: "Register human-readable names on sidechain slot 2.",
  },
  {
    name: "Thunder",
    host: "thunder.drivechain.dev",
    description: "Payments and deposits on sidechain slot 9.",
  },
  {
    name: "Snowside",
    host: "snowside.example",
    description: "EVM tooling for sidechain slot 88.",
  },
  {
    name: "Drivechain Registry",
    host: "drivechain.dev/config",
    description: "JSON registry of networks, backends, and explorers.",
  },
];

export function ExploreScreen(): React.JSX.Element {
  // Local, display-only address text. Nothing dereferences it — the browser
  // engine is a mock, so the value is only echoed back into the UI.
  const [address, setAddress] = useState("");

  return (
    <Screen>
      <Eyebrow>Explore</Eyebrow>
      <Title>Explore</Title>
      <Subtitle>
        A Web3-enabled browser for dApps, sidechain tooling, and block
        explorers.
      </Subtitle>

      <Badge label="Mock data — no browser engine" tone="warning" />

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.iconButton}
        >
          <Mono style={styles.iconText}>{"<"}</Mono>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Forward"
          style={styles.iconButton}
        >
          <Mono style={styles.iconText}>{">"}</Mono>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reload"
          style={styles.iconButton}
        >
          <Mono style={styles.iconText}>{"↻"}</Mono>
        </Pressable>
      </View>

      <Field
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="https://… or search"
        autoCapitalize="none"
      />

      <Card tone="inset">
        <Eyebrow>Address bar</Eyebrow>
        <Mono style={styles.echo}>
          {address.trim().length > 0 ? address.trim() : "(empty)"}
        </Mono>
        <Muted style={styles.echoNote}>
          Navigation is not implemented in this mock — the value is shown back
          verbatim and nothing is loaded.
        </Muted>
      </Card>

      <Card tone="surface" style={styles.featured}>
        <Eyebrow>Featured</Eyebrow>
        <Body style={styles.featuredTitle}>Sidechain tooling</Body>
        <Body>
          Direct links to the dApps and registries the wallet already knows
          about.
        </Body>
      </Card>

      <View style={styles.grid}>
        {SAMPLE_SITES.map((site, index) => (
          <Pressable
            key={site.host}
            testID={`explore-site-${index}`}
            style={styles.siteCard}
          >
            <Text style={styles.siteName}>{site.name}</Text>
            <Mono style={styles.siteHost}>{site.host}</Mono>
            <Muted style={styles.siteDescription}>{site.description}</Muted>
          </Pressable>
        ))}
      </View>

      <Card tone="inset">
        <Eyebrow>Planned</Eyebrow>
        <Body>
          This is a mock. The real screen will host a WebView with a
          wallet-connect bridge so dApps can request signatures.
        </Body>
        <Mono style={styles.planned}>No WebView is wired yet.</Mono>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
  },
  iconText: {
    fontSize: 16,
    fontWeight: "700",
    color: GRAY[300],
  },
  echo: {
    marginTop: 8,
  },
  echoNote: {
    marginTop: 8,
    fontSize: 12,
  },
  featured: {
    marginTop: 16,
  },
  featuredTitle: {
    marginTop: 4,
    fontWeight: "700",
  },
  grid: {
    marginTop: 16,
    gap: 12,
  },
  siteCard: {
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 16,
    backgroundColor: GRAY[900],
    padding: 16,
  },
  siteName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  siteHost: {
    marginTop: 4,
    fontSize: 12,
    color: GRAY[400],
  },
  siteDescription: {
    marginTop: 8,
  },
  planned: {
    marginTop: 8,
  },
});
