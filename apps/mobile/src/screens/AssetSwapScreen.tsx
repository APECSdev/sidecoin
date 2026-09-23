// apps/mobile/src/screens/AssetSwapScreen.tsx
//
// Ported from apps/wallet/src/views/AssetSwapView.vue.
//
// Ported 1:1. The four assets, three market rows, the from/to refs, the
// flipAssets swap, and all five computeds (selectedFromAsset, selectedToAsset,
// parsedAmount, estimatedReceive, canPreview, routeStatus) are carried over
// unchanged — including the fact that the quote is 1:1 in preview mode and
// `estimatedReceive` is therefore just `parsedAmount.toFixed(8)`.
//
// Platform substitutions, no logic loss:
//   • `<select v-model>` is replaced with a pressable symbol-chip row. RN has
//     no native <select>; a chip row preserves the same single-choice
//     semantics and keeps the selected value in the same state variables.
//   • `<input inputmode="decimal">` -> TextInput with keyboardType
//     "decimal-pad"; parsing still runs through the same Number() + isFinite
//     guard.
//   • `<output>` -> a Text node.
//   • The route market `<table>` becomes a stacked row list (a 4-column table
//     is not readable at phone width).
//   • "Preview quote" remains a disabled-until-valid button exactly as before;
//     it has no handler in the Vue view either.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ECASH, GRAY } from "../theme/colors";
import {
  Badge,
  Body,
  Button,
  Card,
  Eyebrow,
  Mono,
  Muted,
  Title,
} from "../components/ui";

const assets = [
  {
    symbol: "eCash",
    name: "eCash L1",
    chain: "L1",
    balance: "1.32257244",
  },
  {
    symbol: "THUNDER",
    name: "Thunder Network",
    chain: "Thunder",
    balance: "3.02700000",
  },
  {
    symbol: "ZSD",
    name: "zSide",
    chain: "zSide",
    balance: "0.70000000",
  },
  {
    symbol: "BTA",
    name: "BitAssets",
    chain: "BitAssets",
    balance: "0.00000000",
  },
];

const marketRows = [
  {
    pair: "eCash / THUNDER",
    route: "L1 → Thunder",
    rate: "1.00000000",
    liquidity: "94%",
  },
  {
    pair: "THUNDER / ZSD",
    route: "Thunder → zSide",
    rate: "0.99750000",
    liquidity: "81%",
  },
  {
    pair: "eCash / BTA",
    route: "L1 → BitAssets",
    rate: "1.00000000",
    liquidity: "Preview",
  },
];

export function AssetSwapScreen(): React.JSX.Element {
  const [fromAsset, setFromAsset] = useState("eCash");
  const [toAsset, setToAsset] = useState("THUNDER");
  const [amount, setAmount] = useState("");
  const [slippage] = useState("0.50");

  const selectedFromAsset =
    assets.find((asset) => asset.symbol === fromAsset) ?? assets[0];
  const selectedToAsset =
    assets.find((asset) => asset.symbol === toAsset) ?? assets[1];

  const parsedAmount = (() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  const estimatedReceive = !parsedAmount
    ? "0.00000000"
    : parsedAmount.toFixed(8);

  const canPreview = parsedAmount > 0 && fromAsset !== toAsset;

  const routeStatus =
    fromAsset === toAsset
      ? "Choose another asset"
      : !parsedAmount
        ? "Enter an amount"
        : "Route ready";

  function flipAssets(): void {
    const currentFrom = fromAsset;
    setFromAsset(toAsset);
    setToAsset(currentFrom);
  }

  function renderAssetChips(
    selected: string,
    onSelect: (symbol: string) => void,
  ): React.JSX.Element {
    return (
      <View style={styles.chipRow}>
        {assets.map((asset) => {
          const isSelected = asset.symbol === selected;
          return (
            <Pressable
              key={asset.symbol}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(asset.symbol)}
              style={[styles.chip, isSelected ? styles.chipActive : null]}
            >
              <Text
                style={[
                  styles.chipText,
                  isSelected ? styles.chipTextActive : null,
                ]}
              >
                {asset.symbol}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Card style={styles.hero}>
        <View style={styles.heroTags}>
          <Eyebrow>Asset routing</Eyebrow>
          <Badge label="Preview mode" tone="active" />
        </View>

        <Text style={styles.heroTitle}>Asset Swap</Text>
        <Body style={styles.heroBody}>
          Swap between eCash and Drivechain assets on Signet. Preview routes,
          quotes, fees, and settlement paths from one wallet-native trading
          surface.
        </Body>

        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>8</Text>
            <Text style={styles.statLabel}>Assets</Text>
          </View>
          <View style={[styles.statCell, styles.statCellBordered]}>
            <Text style={styles.statValue}>12</Text>
            <Text style={styles.statLabel}>Routes</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>Signet</Text>
            <Text style={styles.statLabel}>Network</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.swapCard}>
        {/* From */}
        <Card tone="inset" style={styles.sideCard}>
          <View style={styles.sideHead}>
            <View style={styles.sideHeadCopy}>
              <Text style={styles.sideLabel}>From</Text>
              <Muted style={styles.sideName}>{selectedFromAsset.name}</Muted>
            </View>
            <Muted style={styles.sideBalance}>
              Balance: {selectedFromAsset.balance}
            </Muted>
          </View>

          <View style={styles.amountRow}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.0"
              placeholderTextColor={GRAY[700]}
              style={styles.amountInput}
            />
          </View>

          {renderAssetChips(fromAsset, setFromAsset)}
        </Card>

        <View style={styles.flipRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Flip swap direction"
            onPress={flipAssets}
            style={styles.flipButton}
          >
            <Text style={styles.flipGlyph}>⇅</Text>
          </Pressable>
        </View>

        {/* To */}
        <Card tone="inset" style={styles.sideCard}>
          <View style={styles.sideHead}>
            <View style={styles.sideHeadCopy}>
              <Text style={styles.sideLabel}>To</Text>
              <Muted style={styles.sideName}>{selectedToAsset.name}</Muted>
            </View>
            <Muted style={styles.sideBalance}>
              Balance: {selectedToAsset.balance}
            </Muted>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amountOutput}>{estimatedReceive}</Text>
          </View>

          {renderAssetChips(toAsset, setToAsset)}
        </Card>

        {/* Route details */}
        <Card tone="inset" style={styles.routeCard}>
          <View style={styles.routeRow}>
            <Text style={styles.routeLabel}>Route</Text>
            <Text style={styles.routeValue}>
              {selectedFromAsset.chain} → {selectedToAsset.chain}
            </Text>
          </View>
          <View style={styles.routeRow}>
            <Text style={styles.routeLabel}>Rate</Text>
            <Text style={styles.routeValue}>1.00000000</Text>
          </View>
          <View style={styles.routeRow}>
            <Text style={styles.routeLabel}>Slippage tolerance</Text>
            <Text style={styles.routeValue}>{slippage}%</Text>
          </View>
          <View style={styles.routeRow}>
            <Text style={styles.routeLabel}>Estimated fee</Text>
            <Text style={styles.routeValue}>0.00001000 BTC</Text>
          </View>
          <View style={styles.routeRow}>
            <Text style={styles.routeLabel}>Settlement path</Text>
            <Text style={styles.routeValue}>Signet route preview</Text>
          </View>
          <View style={styles.routeRow}>
            <Text style={styles.routeLabel}>Status</Text>
            <Text style={styles.routeStatus}>{routeStatus}</Text>
          </View>
        </Card>

        <Button
          label="Preview quote"
          disabled={!canPreview}
          onPress={() => {
            /* Preview only — the Vue view has no handler on this button. */
          }}
          fullWidth
          style={styles.previewButton}
        />
      </Card>

      <Card style={styles.marketCard}>
        <View style={styles.marketHead}>
          <Text style={styles.marketTitle}>Route Market</Text>
          <Muted style={styles.marketSub}>Signet liquidity preview</Muted>
        </View>

        <View style={styles.marketTable}>
          <View style={styles.marketHeaderRow}>
            <Text style={styles.marketTh}>Pair / Route</Text>
            <Text style={styles.marketThRight}>Rate</Text>
          </View>
          {marketRows.map((row) => (
            <View key={row.pair} style={styles.marketRow}>
              <View style={styles.marketCell}>
                <Text style={styles.marketPair}>{row.pair}</Text>
                <Text style={styles.marketRoute}>{row.route}</Text>
              </View>
              <View style={styles.marketCellEnd}>
                <Mono style={styles.marketRate}>{row.rate}</Mono>
                <Text style={styles.marketLiquidity}>{row.liquidity}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.flowCard}>
        <Text style={styles.marketTitle}>Swap Flow</Text>
        <View style={styles.flowSteps}>
          {[
            { eyebrow: "Step 1", title: "Choose route" },
            { eyebrow: "Step 2", title: "Preview quote" },
            { eyebrow: "Step 3", title: "Settle on Signet" },
          ].map((step) => (
            <Card key={step.eyebrow} tone="inset" style={styles.flowStep}>
              <Text style={styles.flowEyebrow}>{step.eyebrow}</Text>
              <Text style={styles.flowTitle}>{step.title}</Text>
            </Card>
          ))}
        </View>
      </Card>

      <Card tone="accent" style={styles.routingCard}>
        <Text style={styles.routingTitle}>Drivechain Routing</Text>
        <Muted style={styles.routingBody}>
          Move value between L1, Thunder, zSide, BitAssets, and future
          Drivechain markets from one Sidecoin wallet.
        </Muted>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 24,
  },
  hero: {
    padding: 24,
  },
  heroTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  heroTitle: {
    marginTop: 12,
    fontSize: 34,
    fontWeight: "900",
    color: "#ffffff",
  },
  heroBody: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 22,
  },
  statsRow: {
    marginTop: 20,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: GRAY[800],
    borderRadius: 16,
    backgroundColor: "rgba(3,7,18,0.7)",
    padding: 12,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  statCellBordered: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: GRAY[800],
  },
  statValue: {
    fontSize: 18,
    fontWeight: "900",
    color: ECASH[400],
  },
  statLabel: {
    marginTop: 2,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: GRAY[500],
  },
  swapCard: {
    padding: 16,
  },
  sideCard: {
    padding: 16,
  },
  sideHead: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  sideHeadCopy: {
    flexShrink: 1,
  },
  sideLabel: {
    fontSize: 13,
    color: GRAY[400],
  },
  sideName: {
    marginTop: 4,
    fontSize: 12,
  },
  sideBalance: {
    fontSize: 12,
    color: GRAY[600],
  },
  amountRow: {
    flexDirection: "row",
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 28,
    fontWeight: "600",
    color: "#ffffff",
    padding: 0,
  },
  amountOutput: {
    flex: 1,
    minWidth: 0,
    fontSize: 28,
    fontWeight: "600",
    color: "#ffffff",
  },
  chipRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 10,
    backgroundColor: GRAY[900],
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: ECASH[500],
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: GRAY[300],
  },
  chipTextActive: {
    color: "#ffffff",
  },
  flipRow: {
    paddingVertical: 12,
    alignItems: "center",
  },
  flipButton: {
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 999,
    backgroundColor: GRAY[950],
    padding: 8,
  },
  flipGlyph: {
    fontSize: 16,
    color: GRAY[300],
  },
  routeCard: {
    marginTop: 16,
    padding: 16,
    gap: 8,
  },
  routeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  routeLabel: {
    fontSize: 13,
    color: GRAY[400],
  },
  routeValue: {
    flexShrink: 1,
    fontSize: 13,
    textAlign: "right",
    color: GRAY[200],
  },
  routeStatus: {
    flexShrink: 1,
    fontSize: 13,
    textAlign: "right",
    color: ECASH[300],
  },
  previewButton: {
    marginTop: 16,
  },
  marketCard: {
    overflow: "hidden",
  },
  marketHead: {
    borderBottomWidth: 1,
    borderBottomColor: GRAY[800],
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  marketTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
  },
  marketSub: {
    marginTop: 4,
    fontSize: 13,
  },
  marketTable: {
    padding: 4,
  },
  marketHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(3,7,18,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  marketTh: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: GRAY[500],
  },
  marketThRight: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: GRAY[500],
  },
  marketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderTopWidth: 1,
    borderTopColor: GRAY[800],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  marketCell: {
    flexShrink: 1,
    gap: 4,
  },
  marketCellEnd: {
    alignItems: "flex-end",
    gap: 4,
  },
  marketPair: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  marketRoute: {
    fontSize: 13,
    color: GRAY[400],
  },
  marketRate: {
    fontSize: 13,
    color: ECASH[300],
  },
  marketLiquidity: {
    fontSize: 13,
    color: GRAY[300],
  },
  flowCard: {
    padding: 20,
  },
  flowSteps: {
    marginTop: 16,
    gap: 12,
  },
  flowStep: {
    padding: 16,
  },
  flowEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: GRAY[500],
  },
  flowTitle: {
    marginTop: 4,
    fontWeight: "600",
    color: "#ffffff",
  },
  routingCard: {
    padding: 20,
  },
  routingTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: ECASH[400],
  },
  routingBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 22,
  },
});