// apps/mobile/src/__tests__/ScrollableScreens.test.tsx
//
// Regression test for the clipped-content bug: ReceiveScreen (and the other
// three screens below) rendered a plain <View style={styles.root}> with NO
// ScrollView. Content below the fold -- most importantly the receive address
// card -- was therefore unreachable on a phone-sized screen. The fix swaps in
// a ScrollView.
//
// This test asserts each screen's root is (or is wrapped by) a ScrollView, so
// the bug cannot silently return. It would have FAILED before the fix.

import React from "react";
import { ScrollView } from "react-native";
import { render } from "@testing-library/react-native";

// Navigation -- screens re-read the wallet on focus; make it a mount effect.
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(cb, [cb]);
  },
}));

// A stored wallet so the screens take their "content" branch rather than the
// "setup required" alert.
jest.mock("../keystore", () => ({
  loadWallet: jest.fn(async () => ({
    version: 1,
    network: "signet",
    mnemonic:
      "abandon abandon abandon abandon abandon abandon abandon abandon " +
      "abandon abandon abandon about",
    createdAt: 0,
  })),
  hasWallet: jest.fn(async () => true),
  saveWallet: jest.fn(async () => undefined),
  setWalletNetwork: jest.fn(async () => undefined),
  clearWallet: jest.fn(async () => undefined),
}));

jest.mock("@react-native-clipboard/clipboard", () => ({
  __esModule: true,
  default: { setString: jest.fn() },
}));

jest.mock("react-native-qrcode-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { __esModule: true, default: () => React.createElement(View) };
});

jest.mock("../api", () => ({
  getSidechains: jest.fn(async () => []),
  getDeposits: jest.fn(async () => []),
  getWalletBalance: jest.fn(async () => null),
  getL1Balance: jest.fn(async () => null),
  getMarketPrice: jest.fn(async () => null),
  getCoinNewsFeeds: jest.fn(async () => []),
  getCoinNewsPosts: jest.fn(async () => []),
  satsToBtc: (s: bigint) => String(s),
  L1_CHAIN_ID: "signet",
  ESPLORA_BASES: {},
}));

import { ReceiveScreen } from "../screens/ReceiveScreen";
import { SidechainsScreen } from "../screens/SidechainsScreen";
import { ToolboxScreen } from "../screens/ToolboxScreen";
import { MarketsScreen } from "../screens/MarketsScreen";

describe("scrollable screens (clipped-content regression)", () => {
  const cases: [string, React.ComponentType][] = [
    ["ReceiveScreen", ReceiveScreen],
    ["SidechainsScreen", SidechainsScreen],
    ["ToolboxScreen", ToolboxScreen],
    ["MarketsScreen", MarketsScreen],
  ];

  it.each(cases)("%s renders inside a ScrollView", (_name, Component) => {
    const { UNSAFE_getAllByType } = render(<Component />);
    expect(UNSAFE_getAllByType(ScrollView).length).toBeGreaterThan(0);
  });
});
