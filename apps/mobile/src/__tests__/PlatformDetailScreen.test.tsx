// apps/mobile/src/__tests__/PlatformDetailScreen.test.tsx
//
// Ported from apps/wallet/src/__tests__/PlatformDetailView.test.ts.
//
// Covers the same assertions the Vue suite made about PlatformDetailView:
// the Thunder dedicated page, its feature tabs and overview actions, the
// Thunder Payments/Channels/Liquidity sub-tabs, the PRO gate for locked
// platforms, the BitNames Contacts + Messages tabs, the coming-soon slot-TBD
// platform, and the not-found state for an unknown id.
//
// The Vue suite asserted against `wrapper.text()` (a whole-tree substring
// search). React Native Testing Library has no single equivalent accessor, so
// `treeText()` below flattens every rendered string the same way. This keeps
// the assertions identical to the originals instead of fragmenting them into
// getByText calls that trip over text that legitimately appears more than once
// (e.g. "Payments" is both a tab label and an overview action title).

import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";

const mockGoBack = jest.fn();
let mockPlatformId = "thunder";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { platformId: mockPlatformId } }),
}));

// Screen (components/ui.tsx) reads useSafeAreaInsets; give it zero insets so
// no SafeAreaProvider has to wrap the tree in the test environment.
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// A stored wallet so CoinNewsComposer/Preview (imported via BitMessagesPreview)
// do not touch AsyncStorage/Keychain in the test environment.
jest.mock("../keystore", () => ({
  loadWallet: jest.fn(async () => ({
    version: 1,
    network: "betanet",
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

// The BitMessages tab renders CoinNewsPreview, which fetches the feeds.
// The whole module is mocked (as the sibling screen tests do) so importing
// PlatformDetailScreen does not pull the real keystore in via the api layer.
jest.mock("../api", () => ({
  getCoinNewsFeeds: jest.fn(async () => [
    {
      id: "us-weekly",
      name: "US Weekly",
      language: "en",
      enabled: true,
      post_count: 1,
    },
    {
      id: "japan-weekly",
      name: "Japan Weekly",
      language: "ja",
      enabled: true,
      post_count: 1,
    },
  ]),
  getCoinNewsPosts: jest.fn(async (feedId: string) => ({
    feed: {
      id: feedId,
      name: feedId === "japan-weekly" ? "Japan Weekly" : "US Weekly",
    },
    posts: [
      {
        id: `post_${feedId}`,
        title:
          feedId === "japan-weekly"
            ? "Live API Japan post"
            : "Live API wallet post",
        body: null,
        link: null,
        author: null,
        created_at: 1781568001,
        fee_sats: "1108",
        flag: null,
        txid: "a".repeat(64),
        status: "confirmed",
      },
    ],
    next_cursor: null,
  })),
  satsToBtc: (s: bigint) => String(s),
  L1_CHAIN_ID: "signet",
  ESPLORA_BASES: {},
}));

import { PlatformDetailScreen } from "../screens/PlatformDetailScreen";

function mountPlatform(platformId: string): string {
  mockPlatformId = platformId;
  const tree = render(<PlatformDetailScreen />).toJSON();
  if (tree == null || Array.isArray(tree)) {
    throw new Error("PlatformDetailScreen rendered no single root");
  }
  return treeText(tree);
}

/**
 * Flatten every rendered string, mirroring the Vue suite's `wrapper.text()`.
 * JSX splits `{"a"} {"b"}` into sibling text nodes, so runs of whitespace are
 * collapsed before comparison to match the Vue template's single text node.
 */
function treeText(node: ReactTestRendererJSON | string | null): string {
  if (node == null) return "";
  if (typeof node === "string") return node;

  const own = node.children ?? [];
  return own
    .map((child) => treeText(child))
    .join(" ")
    .replace(/\s+/g, " ");
}

/** Render, press the tab labelled `label`, return the new text. */
function pressTab(platformId: string, tabId: string): string {
  mockPlatformId = platformId;
  const { getByTestId, toJSON } = render(<PlatformDetailScreen />);
  fireEvent.press(getByTestId(`platform-tab-${tabId}`));

  const tree = toJSON();
  return tree && !Array.isArray(tree) ? treeText(tree) : "";
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatformId = "thunder";
});

describe("PlatformDetailScreen", () => {
  it("renders Thunder as a dedicated platform page", () => {
    const text = mountPlatform("thunder");
    expect(text).toContain("Thunder Network");
    expect(text).toContain("Platform · Slot 9");
    expect(text).toContain("Overview");
    expect(text).toContain("Parent Chain");
    expect(text).toContain("Activity");
    expect(text).toContain("Payments");
  });

  it("renders horizontal feature tabs for Basic platforms", () => {
    const text = mountPlatform("thunder");
    expect(text).toContain("Payments");
    expect(text).toContain("Channels");
    expect(text).toContain("Liquidity");
  });

  it("renders Thunder-specific overview actions", () => {
    const text = mountPlatform("thunder");
    expect(text).toContain("Create invoice");
    expect(text).toContain("Send payment");
    expect(text).toContain("Channel liquidity");
    expect(text).toContain("Liquidity planner");
  });

  it("can switch to the Thunder Payments tab", () => {
    const text = pressTab("thunder", "payments");
    expect(text).toContain("Thunder Payments");
    expect(text).toContain("Send Payment");
    expect(text).toContain("Create Invoice");
    expect(text).toContain("Route estimate");
    expect(text).toContain("No live Thunder payments are indexed yet.");
    expect(text).not.toContain("thunder-pay-7f4a");
  });

  it("can switch to the Thunder Channels tab", () => {
    const text = pressTab("thunder", "channels");
    expect(text).toContain("Thunder Channels");
    expect(text).toContain("Open channels");
    expect(text).toContain("Inbound liquidity");
    expect(text).toContain("Outbound liquidity");
    expect(text).toContain("Average health");
    expect(text).toContain("No live Thunder channels are indexed yet.");
    expect(text).not.toContain("routing-peer-01");
    expect(text).not.toContain("merchant-hub");
    expect(text).not.toContain("backup-route");
  });

  it("can switch to the Thunder Liquidity tab", () => {
    const text = pressTab("thunder", "liquidity");
    expect(text).toContain("Liquidity Planner");
    expect(text).toContain("Available to send");
    expect(text).toContain("Available to receive");
    expect(text).toContain("Route coverage");
    expect(text).toContain("Suggested action");
    expect(text).toContain("Recommendations");
    expect(text).toContain(
      "No live Thunder liquidity recommendations are indexed yet.",
    );
    expect(text).toContain(
      "No live Thunder liquidity diagnostics are indexed yet.",
    );
    expect(text).not.toContain("Add inbound capacity");
    expect(text).not.toContain("Display-only liquidity view");
  });

  it("renders a clear PRO CTA for gated platforms", () => {
    const text = mountPlatform("zside");
    expect(text).toContain("Unlock zSide with Sidecoin PRO");
    expect(text).toContain("Historical analysis across platforms");
    expect(text).toContain("Early access to proposed platforms like RISCy");
  });

  it("renders BitNames Contacts and Messages tabs", () => {
    const text = mountPlatform("bitnames");
    expect(text).toContain("Contacts");
    expect(text).toContain("Messages");
    expect(text).toContain("Live message data not indexed yet");
    expect(text).not.toContain("demo conversation events");
  });

  it("shows an empty BitNames contact state instead of fake contacts", () => {
    const text = mountPlatform("bitnames");
    expect(text).not.toContain("alice.bit");
    expect(text).not.toContain("merchant.bit");
    expect(text).not.toContain("support.bit");
  });

  it("does not render backend warning copy in the BitMessages UI", () => {
    const text = mountPlatform("bitnames");
    expect(text).not.toContain("display-only");
    expect(text).not.toContain("no messages leave your wallet");
    expect(text).not.toContain("live messaging is connected");
    expect(text).not.toContain("Messaging preview disabled");
    expect(text).not.toContain("No network calls");
    expect(text).not.toContain("Send disabled");
    expect(text).not.toContain("SupaQt");
  });

  it("renders Elements Plus as a coming-soon platform with Slot TBD", () => {
    const text = mountPlatform("elementsplus");
    expect(text).toContain("Elements Plus");
    expect(text).toContain("Platform · Slot TBD");
    expect(text).toContain("Coming Soon");
    expect(text).toContain("Unlock Elements Plus with Sidecoin PRO");
  });

  it("shows a not-found state for unknown platforms", () => {
    const text = mountPlatform("unknown");
    expect(text).toContain("Platform not found");
  });
});
