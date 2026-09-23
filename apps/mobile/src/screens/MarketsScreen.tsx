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

import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { getMarketPrice, type MarketPrice } from "../api";
import { GRAY } from "../theme/colors";
import {
  Alert,
  Badge,
  Body,
  Button,
  Card,
  Eyebrow,
  Loading,
  Muted,
  Title,
} from "../components/ui";

function formatAsOf(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "—";
  }

  return date.toISOString().replace(".000Z", "Z");
}

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
          <Loading label="Loading live market price…" />
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
            <Text style={styles.headTitle}>Market charts coming soon</Text>
            <Body style={styles.chartsBody}>
              Historical market data is not indexed yet. This panel will display
              ECX/eCash charts once time-series market data is available.
            </Body>
          </View>
          <Badge label="Placeholder" tone="neutral" />
        </View>

        <View style={styles.dashed}>
          <Text style={styles.dashedTitle}>No chart data loaded</Text>
          <Muted style={styles.dashedBody}>
            No mocked candles, generated lines, or sample history are shown
            here. Live charts will appear after historical market indexing is
            available.
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
