// apps/mobile/src/__tests__/MockScreens.test.tsx
//
// Tests for the two new (mocked) bottom tabs — Feed and Explore — plus the
// standalone QR scanner route added for the FAB menu.
//
// Feed and Explore are explicitly mocked surfaces: they must render their
// sample content AND disclose that it is mock data, so the UI never claims
// live network activity.

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

// The Screen primitive reads safe-area insets; the provider is not mounted
// in these focused unit tests, so return zero insets instead of throwing.
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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

describe("FeedScreen (mock)", () => {
  it("renders the feed heading", () => {
    render(<FeedScreen />);
    expect(screen.getAllByText("Feed").length).toBeGreaterThan(0);
  });

  it("discloses that the content is mock data", () => {
    const { toJSON } = render(<FeedScreen />);
    expect(treeText(toJSON())).toContain("Mock data");
  });

  it("renders both public and encrypted entries in one scroll", () => {
    const { toJSON } = render(<FeedScreen />);
    const text = treeText(toJSON());
    expect(text).toContain("Nostr");
    expect(text).toContain("Encrypted");
  });

  it("renders at least one sample feed item", () => {
    render(<FeedScreen />);
    expect(screen.getByTestId("feed-item-0")).toBeTruthy();
  });
});

describe("ExploreScreen (mock)", () => {
  it("renders the explore heading", () => {
    render(<ExploreScreen />);
    expect(screen.getAllByText("Explore").length).toBeGreaterThan(0);
  });

  it("discloses that the content is mock data", () => {
    const { toJSON } = render(<ExploreScreen />);
    expect(treeText(toJSON())).toContain("Mock data");
  });

  it("renders an address bar", () => {
    render(<ExploreScreen />);
    expect(screen.getByLabelText("Address")).toBeTruthy();
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
