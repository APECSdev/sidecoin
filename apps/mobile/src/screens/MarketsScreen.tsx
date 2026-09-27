// apps/mobile/src/screens/MarketsScreen.tsx
//
// Ported from apps/wallet/src/views/MarketsView.vue.
//
// Ported 1:1. The Vue view is a `<script setup>` with three refs (price,
// loading, error), a loader, and two pure formatters; that logic is carried
// over unchanged and driven by useState/useEffect instead of ref/onMounted.
//
// Two copy differences are intentional and required:
//   • The Vue view's own description says data comes "from SupaQt", and its
//     formatSource() defaults the label to "SupaQt". Per AGENTS.md the ECX
//     price is sourced from eCash Farm (api/index.ts getMarketPrice reads
//     `projected.ecxUsd` and sets `source = "eCash Farm"`). The labels are
//     therefore corrected to eCash Farm; `formatSource` still falls back to a
//     provider name when the upstream string is empty or "hardcoded".
//   • The footer of the "As of" tile repeated the provider name; it now shows
//     the upstream `source` value.
//
// CHARTS: the price tiles above are live (eCash Farm). The chart panel below is
// driven by MOCK time-series data (MOCK_ECX_HISTORY) until the market indexer
// exposes a history endpoint — the same placeholder the Vue view described.
// Do NOT present this series as real: it is badged "Mock data" and the caption
// says so. When /market/history lands, swap the constant for a fetch and drop
// the badge; the CartesianChart wiring stays as-is.

import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CartesianChart, Line } from "victory-native";

import { getMarketPrice, type MarketPrice } from "../api";
import { ECASH, GRAY } from "../theme/colors";
import {
  Alert,
  Badge,
  Body,
  Button,
  Card,
  Eyebrow,
  Muted,
  Skeleton,
  Title,
} from "../components/ui";

function formatAsOf(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "—";
  }

  return date.toISOString().replace(".000Z", "Z");
}

// ──────────────────────────────────────────────────────
// MOCK time-series market data.
//
// 30 daily ECX/USD samples. These numbers are FABRICATED for the chart
// placeholder — they are not fetched and not a projection. They end near the
// live `projected.ecxUsd` neighbourhood purely so the chart looks plausible
// against the live tile above; treat them as placeholders only.
//
// `day` is a simple 1..N index (the x axis), `price` the mocked USD value.
// CartesianChart needs a numeric x for a linear scale, so we index rather
// than pass Dates.
// ──────────────────────────────────────────────────────
export type MockEcxSample = {
  day: number;
  price: number;
};

export const MOCK_ECX_HISTORY: MockEcxSample[] = [
  { day: 1, price: 71.4 },
  { day: 2, price: 69.8 },
  { day: 3, price: 73.2 },
  { day: 4, price: 76.9 },
  { day: 5, price: 75.1 },
  { day: 6, price: 78.6 },
  { day: 7, price: 82.3 },
  { day: 8, price: 80.7 },
  { day: 9, price: 84.2 },
  { day: 10, price: 88.5 },
  { day: 11, price: 86.9 },
  { day: 12, price: 83.4 },
  { day: 13, price: 85.8 },
  { day: 14, price: 90.1 },
  { day: 15, price: 93.7 },
  { day: 16, price: 91.2 },
  { day: 17, price: 95.6 },
  { day: 18, price: 99.3 },
  { day: 19, price: 97.4 },
  { day: 20, price: 101.8 },
  { day: 21, price: 105.2 },
  { day: 22, price: 102.6 },
  { day: 23, price: 98.9 },
  { day: 24, price: 100.4 },
  { day: 25, price: 103.1 },
  { day: 26, price: 106.7 },
  { day: 27, price: 104.3 },
  { day: 28, price: 102.2 },
  { day: 29, price: 104.9 },
  { day: 30, price: 103.8 },
];

function formatSource(value: string): string {
  return value && value.toLowerCase() !== "hardcoded" ? value : "eCash Farm";
}

export function MarketsScreen(): React.JSX.Element {
  const [price, setPrice] = useState<MarketPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMarketPrice = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setPrice(await getMarketPrice("ecash"));
    } catch (e) {
      console.error("[MarketsScreen] Failed to load market price:", e);
      setPrice(null);
      setError("Live market data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarketPrice();
  }, [loadMarketPrice]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.rootContent}>
      <View>
        <Eyebrow>Live market data</Eyebrow>
        <Title>Markets</Title>
        <Body style={styles.intro}>
          ECX/eCash market data from eCash Farm.
        </Body>
      </View>

      <Card style={styles.section}>
        <View style={styles.head}>
          <View style={styles.headCopy}>
            <Text style={styles.headLabel}>ECX / eCash</Text>
            <Text style={styles.headTitle}>Market Price</Text>
          </View>
          <Button label="Refresh" variant="secondary" size="sm" onPress={loadMarketPrice} />
        </View>

        {loading ? (
          // Skeleton shaped like the price block (label + big number + meta)
          // rather than a spinner, so the card keeps its height while the
          // eCash Farm request is in flight.
          <View testID="markets-skeleton" style={styles.marketSkeleton}>
            <Skeleton width="45%" height={30} radius={10} />
            <Skeleton width="60%" height={12} />
            <Skeleton width="35%" height={12} />
          </View>
        ) : error ? (
          <Alert tone="warning" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Button
              label="Retry"
              variant="pro"
              size="sm"
              onPress={loadMarketPrice}
              style={styles.retry}
            />
          </Alert>
        ) : price ? (
          <View style={styles.grid}>
            <Card tone="inset" style={styles.tile}>
              <Text style={styles.tileLabel}>Asset</Text>
              <Text style={styles.tileValue}>{price.asset}</Text>
              <Muted style={styles.tileSub}>{price.name}</Muted>
            </Card>

            <Card tone="inset" style={styles.tile}>
              <Text style={styles.tileLabel}>Price</Text>
              <Text style={[styles.tileValue, styles.price]}>USD {price.price_usd}</Text>
              <Muted style={styles.tileSub}>{formatSource(price.source)}</Muted>
            </Card>

            <Card tone="inset" style={styles.tile}>
              <Text style={styles.tileLabel}>As of</Text>
              <Text style={styles.tileMono}>{formatAsOf(price.as_of)}</Text>
              <Muted style={styles.tileSub}>
                {price.source && price.source.toLowerCase() !== "hardcoded"
                  ? price.source
                  : "eCash Farm"}
              </Muted>
            </Card>
          </View>
        ) : (
          <Muted style={styles.empty}>No live market price is available.</Muted>
        )}
      </Card>

      <Card style={styles.section}>
        <View style={styles.head}>
          <View style={styles.headCopy}>
            <Eyebrow style={styles.chartsEyebrow}>Charts</Eyebrow>
            <Text style={styles.headTitle}>ECX / USD — last 30 days</Text>
            <Body style={styles.chartsBody}>
              Historical market data is not indexed yet, so the series below is
              placeholder data. It will be replaced by the live ECX/eCash
              history once the market indexer exposes it.
            </Body>
          </View>
          <Badge label="Mock data" tone="warning" />
        </View>

        <View testID="markets-chart" style={styles.chartWrap}>
          <CartesianChart
            data={MOCK_ECX_HISTORY}
            xKey="day"
            yKeys={["price"]}
            axisOptions={{
              labelColor: GRAY[400],
              lineColor: GRAY[800],
              axisSide: { x: "bottom", y: "left" },
            }}
          >
            {({ points }) => (
              <Line
                points={points.price}
                color={ECASH[500]}
                strokeWidth={3}
                curveType="monotoneX"
              />
            )}
          </CartesianChart>
        </View>

        <View style={styles.chartLegend}>
          <View style={styles.chartLegendDot} />
          <Muted style={styles.chartLegendText}>
            ECX / USD · 30 daily samples · mock data, not a live index
          </Muted>
        </View>

        <View style={styles.dashed}>
          <Text style={styles.dashedTitle}>Placeholder series</Text>
          <Muted style={styles.dashedBody}>
            This line is generated sample data so the chart can be wired and
            reviewed. Do not read it as market history. Live charts will appear
            after historical market indexing is available.
          </Muted>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 24,
  },
  // ScrollView content container -- see the note in ReceiveScreen.tsx.
  rootContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 24,
  },
  intro: {
    marginTop: 8,
  },
  section: {
    padding: 20,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headCopy: {
    flexShrink: 1,
  },
  headLabel: {
    fontSize: 13,
    color: GRAY[400],
  },
  headTitle: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: "900",
    color: "#ffffff",
  },
  marketSkeleton: {
    marginTop: 20,
    gap: 10,
  },
  errorBox: {
    marginTop: 20,
  },
  errorText: {
    fontSize: 13,
    color: "#fcd34d",
  },
  retry: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
  grid: {
    marginTop: 20,
    gap: 12,
  },
  tile: {
    padding: 16,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: GRAY[500],
  },
  tileValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "900",
    color: "#ffffff",
  },
  price: {
    color: "#fb923c",
  },
  tileMono: {
    marginTop: 8,
    fontFamily: "monospace",
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  tileSub: {
    marginTop: 4,
    fontSize: 13,
  },
  empty: {
    marginTop: 20,
  },
  chartsEyebrow: {
    color: GRAY[500],
  },
  chartsBody: {
    marginTop: 8,
  },
  chartWrap: {
    marginTop: 20,
    height: 220,
  },
  chartLegend: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chartLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ECASH[500],
  },
  chartLegendText: {
    flexShrink: 1,
  },
  dashed: {
    marginTop: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: GRAY[700],
    borderRadius: 12,
    backgroundColor: GRAY[950],
    padding: 20,
    alignItems: "center",
  },
  dashedTitle: {
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: GRAY[500],
    textAlign: "center",
  },
  dashedBody: {
    marginTop: 10,
    textAlign: "center",
  },
});
