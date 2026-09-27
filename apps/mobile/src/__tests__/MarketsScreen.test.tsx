// apps/mobile/src/__tests__/MarketsScreen.test.tsx
//
// Covers the Markets chart panel. The price tiles are fed by the live eCash
// Farm adapter (getMarketPrice); the chart below them is deliberately backed by
// MOCK time-series data (MOCK_ECX_HISTORY) until a market-history endpoint
// exists. These tests pin that contract:
//
//   1. MarketsScreen renders the CartesianChart with the mock series and marks
//      it as mock data, so a future change cannot quietly present the fabricated
//      series as a live index.
//   2. The mock series is well-formed (positive, ordered x) because
//      CartesianChart needs a numeric x for a linear scale.
//   3. A failing price fetch still renders the chart (the two panels are
//      independent), so an adapter outage does not blank the placeholder.
//
// It would have FAILED before the chart existed: the previous screen rendered a
// "Market charts coming soon" placeholder and no <CartesianChart> at all.

import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";

// victory-native draws through @shopify/react-native-skia, whose RNSkiaModule
// TurboModule does not exist under Jest. Mock the 41.x surface (CartesianChart +
// Line) the same way App.test.tsx does, and record the props/children the screen
// passes so the assertions below can inspect them.
const chartProps: any = {};
let lastPoints: Record<string, any[]> | null = null;

jest.mock("victory-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    CartesianChart: ({ children, ...rest }: any) => {
      Object.assign(chartProps, rest);
      const keys: string[] = Array.isArray(rest.yKeys) ? rest.yKeys : [];
      const rows: any[] = Array.isArray(rest.data) ? rest.data : [];
      const points: Record<string, any[]> = {};
      for (const k of keys) {
        points[k] = rows.map((row: any, i: number) => ({
          x: row?.[rest.xKey] ?? i,
          y: typeof row?.[k] === "number" ? row[k] : 0,
        }));
      }
      lastPoints = points;
      const rendered =
        typeof children === "function" ? children({ points }) : children;
      return React.createElement(View, { testID: "mock-cartesian-chart" }, rendered);
    },
    Line: "Line",
  };
});

jest.mock("../api", () => ({
  getMarketPrice: jest.fn(),
}));

import { getMarketPrice } from "../api";
import { MarketsScreen, MOCK_ECX_HISTORY } from "../screens/MarketsScreen";

const mockedGetMarketPrice = getMarketPrice as jest.MockedFunction<typeof getMarketPrice>;

const LIVE_PRICE = {
  asset: "ECX",
  name: "eCash",
  price_usd: 103.8,
  source: "eCash Farm",
  as_of: "2026-09-23T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(chartProps)) delete chartProps[k];
  lastPoints = null;
});

describe("MarketsScreen chart (mock data)", () => {
  it("renders the CartesianChart over the mock series and labels it as mock", async () => {
    mockedGetMarketPrice.mockResolvedValue(LIVE_PRICE as any);

    render(<MarketsScreen />);

    // The chart mounts synchronously (independent of the price fetch).
    expect(screen.getByTestId("markets-chart")).toBeTruthy();
    expect(screen.getByTestId("mock-cartesian-chart")).toBeTruthy();

    // The series is the mock constant, keyed on the numeric x (`day`) with a
    // single y series (`price`).
    expect(chartProps.data).toBe(MOCK_ECX_HISTORY);
    expect(chartProps.xKey).toBe("day");
    expect(chartProps.yKeys).toEqual(["price"]);

    // The mock disclosure must be visible so the fabricated series can never be
    // mistaken for a live index.
    expect(screen.getByText("Mock data")).toBeTruthy();
    expect(
      screen.getByText(/mock data, not a live index/i),
    ).toBeTruthy();

    // The <Line> receives one point per sample.
    await waitFor(() => {
      expect(lastPoints?.price).toHaveLength(MOCK_ECX_HISTORY.length);
    });
  });

  it("keeps the mock series well-formed for a linear x scale", () => {
    expect(MOCK_ECX_HISTORY.length).toBeGreaterThan(1);

    MOCK_ECX_HISTORY.forEach((sample, i) => {
      expect(Number.isFinite(sample.day)).toBe(true);
      expect(Number.isFinite(sample.price)).toBe(true);
      expect(sample.price).toBeGreaterThan(0);

      // Strictly increasing x -- CartesianChart maps `day` onto a linear scale.
      if (i > 0) {
        expect(sample.day).toBeGreaterThan(MOCK_ECX_HISTORY[i - 1].day);
      }
    });
  });

  it("still renders the chart when the live price fetch fails", async () => {
    mockedGetMarketPrice.mockRejectedValue(new Error("adapter offline"));

    render(<MarketsScreen />);

    await waitFor(() => {
      expect(screen.getByText(/live market data is unavailable/i)).toBeTruthy();
    });

    // The price panel errored, but the chart placeholder is unaffected.
    expect(screen.getByTestId("mock-cartesian-chart")).toBeTruthy();
    expect(chartProps.data).toBe(MOCK_ECX_HISTORY);
  });
});
