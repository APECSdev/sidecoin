// apps/mobile/src/__tests__/MockScreens.test.tsx
//
// Tests for the two bottom tabs — Feed and Explore — plus the standalone QR
// scanner route added for the FAB menu.
//
// Feed is now HALF REAL: it mounts the live CoinNewsPreview (the same
// dashboard component) above a clearly-labelled mock relay stream. Explore is
// now a real WebView with a minimal chrome. The tests below therefore stub the
// network layer and the WebView native module, and assert that:
//   • the mock relay section still discloses "Mock data",
//   • the live Coin News component is actually mounted on Feed,
//   • Explore starts empty and loads a bookmark when tapped.

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

// The Screen primitive reads safe-area insets; the provider is not mounted
// in these focused unit tests, so return zero insets instead of throwing.
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// Feed reads the live Coin News endpoints, so stub them to return one real
// post per feed. That lets the test prove a real post is interleaved into the
// timeline rather than rendered as its own section.
const mockUsPost = {
  id: "us-1",
  title: "Fed holds rates steady",
  body: null,
  link: null,
  author: "US Weekly Desk",
  created_at: Math.floor(Date.now() / 1000) - 120,
  fee_sats: "200",
  flag: null,
  txid: "aa".repeat(32),
  status: "confirmed",
};
const mockJapanPost = {
  id: "jp-1",
  title: "BitNames weekly recap",
  body: null,
  link: null,
  author: "Japan Weekly Desk",
  created_at: Math.floor(Date.now() / 1000) - 240,
  fee_sats: "200",
  flag: null,
  txid: "bb".repeat(32),
  status: "confirmed",
};
jest.mock("../api", () => ({
  getCoinNewsFeeds: jest.fn(async () => []),
  getCoinNewsPosts: jest.fn(async (feedId: string) => ({
    feed: { id: feedId, name: feedId },
    posts: feedId === "japan-weekly" ? [mockJapanPost] : [mockUsPost],
    next_cursor: null,
  })),
  satsToBtc: jest.fn(() => "0.00"),
}));

// react-native-webview resolves a native component absent under Jest. The
// stub renders a host View carrying the testID and the resolved source URI so
// tests can assert which URL was loaded.
jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  const WebView = React.forwardRef(({ source, testID }: any, _ref: any) =>
    React.createElement(View, {
      testID,
      accessibilityLabel: source?.uri ?? "",
    }),
  );
  WebView.displayName = "WebView";
  return { __esModule: true, WebView, default: WebView };
});

// Vector icons resolve native fonts absent under Jest.
jest.mock("react-native-vector-icons/MaterialIcons", () => "Icon");

// Clipboard backs the QR capture hand-off.
const mockSetString = jest.fn();
jest.mock("@react-native-clipboard/clipboard", () => ({
  __esModule: true,
  default: { setString: mockSetString, getString: jest.fn(async () => "") },
}));

// The scanner owns the camera permission flow; the route under test only
// wires its onDecode/onClose callbacks, so a controllable stub is enough.
let decodeRef: ((value: string) => void) | undefined;
jest.mock("../components/QrScanner", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    QrScanner: ({
      onDecode,
      onClose,
    }: {
      onDecode: (v: string) => void;
      onClose: () => void;
    }) => {
      decodeRef = onDecode;
      return React.createElement(
        Pressable,
        { testID: "mock-scanner", onPress: () => onDecode("ecash:qxyz") },
        React.createElement(Text, null, "scanner"),
        React.createElement(
          Pressable,
          { testID: "mock-scanner-close", onPress: onClose },
          React.createElement(Text, null, "close"),
        ),
      );
    },
  };
});

import { FeedScreen } from "../screens/FeedScreen";
import { ExploreScreen } from "../screens/ExploreScreen";
import { QrScanScreen } from "../screens/QrScanScreen";

function treeText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(treeText).join(" ");
  const n = node as {
    children?: unknown;
    props?: { children?: unknown };
  };
  // ReactTestRendererJSON keeps rendered children on `.children`; a host
  // element's own props may also carry them. Flatten both.
  return [treeText(n.children), treeText(n.props?.children)].join(" ");
}

describe("FeedScreen (interleaved live Coin News + mock entries)", () => {
  it("renders the feed heading", () => {
    render(<FeedScreen />);
    expect(screen.getAllByText("Feed").length).toBeGreaterThan(0);
  });

  it("discloses the mock items", async () => {
    const { toJSON } = render(<FeedScreen />);
    await screen.findByText("Fed holds rates steady");
    expect(treeText(toJSON())).toContain("Mock");
  });

  it("interleaves real Coin News posts as individual feed rows", async () => {
    render(<FeedScreen />);
    // Both live posts must appear, but as timeline ROWS — never as their own
    // "Coin News" section. The old revision mounted <CoinNewsPreview> which
    // rendered a "Coin News" section heading; that heading must be gone.
    expect(await screen.findByText("Fed holds rates steady")).toBeTruthy();
    expect(await screen.findByText("BitNames weekly recap")).toBeTruthy();
    expect(screen.queryByText("US Weekly")).toBeNull();
    expect(screen.queryByText("Japan Weekly")).toBeNull();
  });

  it("renders both public and encrypted entries in one scroll", () => {
    const { toJSON } = render(<FeedScreen />);
    const text = treeText(toJSON());
    expect(text).toContain("Nostr");
    expect(text).toContain("Encrypted");
  });

  it("renders at least one feed item", () => {
    render(<FeedScreen />);
    expect(screen.getByTestId("feed-item-0")).toBeTruthy();
  });
});

describe("ExploreScreen (real WebView)", () => {
  // The operator asked for a MINIMAL surface: no title, no marketing copy.
  // The address bar is the only chrome, so that is what identifies the screen.
  it("has no descriptive copy — the address bar is the only chrome", () => {
    render(<ExploreScreen />);
    expect(screen.getByTestId("explore-address")).toBeTruthy();
    expect(screen.queryByText("Explore")).toBeNull();
  });

  it("starts with an empty webview (no page loaded)", () => {
    render(<ExploreScreen />);
    expect(screen.getByTestId("explore-webview")).toBeTruthy();
    expect(screen.getByText("No page loaded")).toBeTruthy();
  });

  it("renders an address bar", () => {
    render(<ExploreScreen />);
    expect(screen.getByTestId("explore-address")).toBeTruthy();
  });

  it("renders the verified bookmarks", () => {
    render(<ExploreScreen />);
    for (const label of ["SupaQt", "eCash", "Drivechain", "eCash Farm"]) {
      expect(screen.getByTestId(`explore-bookmark-${label}`)).toBeTruthy();
    }
  });

  it("loads a bookmark into the webview when tapped", () => {
    render(<ExploreScreen />);
    fireEvent.press(screen.getByTestId("explore-bookmark-eCash"));
    // The stub surfaces the resolved source URI via accessibilityLabel.
    expect(
      screen.getByLabelText("https://ecash.com"),
    ).toBeTruthy();
    // The empty-state overlay must be gone once a URL is set.
    expect(screen.queryByText("No page loaded")).toBeNull();
  });
});

describe("QrScanScreen", () => {
  it("shows the scanner before anything is decoded", () => {
    render(
      <QrScanScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ key: "qr-scan", name: "qr-scan" } as never}
      />,
    );
    expect(screen.getByTestId("mock-scanner")).toBeTruthy();
  });

  it("copies the decoded value to the clipboard and displays it", () => {
    mockSetString.mockClear();
    render(
      <QrScanScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ key: "qr-scan", name: "qr-scan" } as never}
      />,
    );
    fireEvent.press(screen.getByTestId("mock-scanner"));
    expect(mockSetString).toHaveBeenCalledWith("ecash:qxyz");
    expect(screen.getByText("ecash:qxyz")).toBeTruthy();
  });

  it("returns to scanning on 'Scan another code'", () => {
    const { toJSON } = render(
      <QrScanScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ key: "qr-scan", name: "qr-scan" } as never}
      />,
    );
    fireEvent.press(screen.getByTestId("mock-scanner"));
    // Now on the confirmation view.
    expect(treeText(toJSON())).toContain("Scanned");
    fireEvent.press(screen.getByLabelText("Scan another code"));
    expect(screen.getByTestId("mock-scanner")).toBeTruthy();
  });

  it("closes back to the previous screen", () => {
    const goBack = jest.fn();
    render(
      <QrScanScreen
        navigation={{ goBack } as never}
        route={{ key: "qr-scan", name: "qr-scan" } as never}
      />,
    );
    fireEvent.press(screen.getByTestId("mock-scanner-close"));
    expect(goBack).toHaveBeenCalled();
  });
});
