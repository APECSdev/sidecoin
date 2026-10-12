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
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// react-native-gifted-charts draws through react-native-svg. Mock the
// LineChart surface the same way App.test.tsx does, and record the props the
// screen passes so the assertions below can inspect them.
const chartProps: any = {};

jest.mock("react-native-gifted-charts", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    LineChart: (props: any) => {
      Object.assign(chartProps, props);
      return React.createElement(View, { testID: "mock-line-chart" });
    },
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
});

describe("MarketsScreen chart (mock data)", () => {
  it("renders the line chart over the mock series and labels it as mock", async () => {
    mockedGetMarketPrice.mockResolvedValue(LIVE_PRICE as any);

    render(<MarketsScreen />);

    // The chart wrapper mounts synchronously (independent of the price fetch);
    // the chart itself renders once onLayout reports the wrapper width.
    const wrap = screen.getByTestId("markets-chart");
    expect(wrap).toBeTruthy();
    fireEvent(wrap, "onLayout", {
      nativeEvent: { layout: { width: 300, height: 220 } },
    });
    expect(screen.getByTestId("mock-line-chart")).toBeTruthy();

    // The series is the mock constant mapped to { value, label } points, one
    // point per sample, drawn as a curved 3px line.
    expect(chartProps.data).toHaveLength(MOCK_ECX_HISTORY.length);
    expect(chartProps.data[0].value).toBe(MOCK_ECX_HISTORY[0].price);
    expect(chartProps.data[0].label).toBe(String(MOCK_ECX_HISTORY[0].day));
    expect(chartProps.curved).toBe(true);
    expect(chartProps.thickness).toBe(3);

    // The mock disclosure must be visible so the fabricated series can never be
    // mistaken for a live index.
    expect(screen.getByText("Mock data")).toBeTruthy();
    expect(
      screen.getByText(/mock data, not a live index/i),
    ).toBeTruthy();

  });

  it("keeps the mock series well-formed for a linear x scale", () => {
    expect(MOCK_ECX_HISTORY.length).toBeGreaterThan(1);

    MOCK_ECX_HISTORY.forEach((sample, i) => {
      expect(Number.isFinite(sample.day)).toBe(true);
      expect(Number.isFinite(sample.price)).toBe(true);
      expect(sample.price).toBeGreaterThan(0);

      // Strictly increasing x -- the chart maps `day` onto a linear scale.
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
    fireEvent(screen.getByTestId("markets-chart"), "onLayout", {
      nativeEvent: { layout: { width: 300, height: 220 } },
    });
    expect(screen.getByTestId("mock-line-chart")).toBeTruthy();
    expect(chartProps.data).toHaveLength(MOCK_ECX_HISTORY.length);
  });
});
