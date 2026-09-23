// apps/mobile/src/__tests__/FabMenu.test.tsx
//
// Regression/behaviour tests for the floating action button (FabMenu).
//
// Context: Send, Receive, and Settings used to be bottom-tab destinations.
// They now live behind this FAB, which also adds a QR scan action. These
// tests assert the menu opens, exposes all four actions, navigates to the
// right route, and dismisses itself.

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

// The navigator is not mounted here; capture navigate() calls directly.
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// react-native-vector-icons resolves native fonts not present under Jest.
jest.mock("react-native-vector-icons/MaterialIcons", () => "Icon");

import { FabMenu } from "../components/FabMenu";

describe("FabMenu", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("starts collapsed, showing only the toggle", () => {
    render(<FabMenu bottomOffset={100} />);
    expect(screen.getByTestId("fab-toggle")).toBeTruthy();
    expect(screen.queryByTestId("fab-action-send")).toBeNull();
  });

  it("exposes Send, Receive, Profile, Settings and Scan QR once opened", () => {
    render(<FabMenu bottomOffset={100} />);
    fireEvent.press(screen.getByTestId("fab-toggle"));

    for (const id of ["send", "receive", "profile", "settings", "scan"]) {
      expect(screen.getByTestId(`fab-action-${id}`)).toBeTruthy();
    }
  });

  it.each([
    ["send", "send"],
    ["receive", "receive"],
    ["profile", "profile"],
    ["settings", "settings"],
    ["scan", "qr-scan"],
  ])("navigates to %s when the %s action is pressed", (id, route) => {
    render(<FabMenu bottomOffset={100} />);
    fireEvent.press(screen.getByTestId("fab-toggle"));
    fireEvent.press(screen.getByTestId(`fab-action-${id}`));
    expect(mockNavigate).toHaveBeenCalledWith(route);
  });

  it("closes the menu after navigating", () => {
    render(<FabMenu bottomOffset={100} />);
    fireEvent.press(screen.getByTestId("fab-toggle"));
    fireEvent.press(screen.getByTestId("fab-action-send"));
    expect(screen.queryByTestId("fab-action-send")).toBeNull();
  });

  it("dismisses via the scrim", () => {
    render(<FabMenu bottomOffset={100} />);
    fireEvent.press(screen.getByTestId("fab-toggle"));
    fireEvent.press(screen.getByTestId("fab-scrim"));
    expect(screen.queryByTestId("fab-action-send")).toBeNull();
  });

  it("floats above the tab bar using the measured offset", () => {
    render(<FabMenu bottomOffset={144} />);
    // The container is absolutely positioned; it must carry the caller's
    // measured offset or it would overlap the tab bar.
    const container = screen.getByTestId("fab-container");
    expect(JSON.stringify(container.props.style)).toContain("144");
  });
});
