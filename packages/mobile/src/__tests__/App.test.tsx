// packages/mobile/src/__tests__/App.test.tsx
//
// Tests for the root App component.
// Verifies that the app renders without crashing, displays
// correct branding, fork countdown info, chain info,
// sidechain list, and workspace validation.

import React from "react";
import { render, screen } from "@testing-library/react-native";
import App from "../App";

// ---------------------------------------------------------------------------
// Mock native modules that crash in a Jest environment
//
// IMPORTANT: jest.mock() factories are hoisted above all imports.
// They cannot reference any imported variables (like `React`).
// Instead, use require() inline inside each factory.
// ---------------------------------------------------------------------------

// react-native-gesture-handler
jest.mock("react-native-gesture-handler", () => {
  const React = require("react");
  const View = require("react-native").View;
  return {
    GestureHandlerRootView: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    PanGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    NativeViewGestureHandler: View,
    ScrollView: require("react-native").ScrollView,
    Directions: {},
  };
});

// react-native-safe-area-context
jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const View = require("react-native").View;
  return {
    SafeAreaProvider: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    SafeAreaView: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => inset,
    SafeAreaInsetsContext: {
      Consumer: ({ children }: any) => children(inset),
    },
    initialWindowMetrics: { frame: { x: 0, y: 0, width: 0, height: 0 }, insets: inset },
  };
});

// react-native-screens
jest.mock("react-native-screens", () => {
  const View = require("react-native").View;
  return {
    enableScreens: jest.fn(),
    screensEnabled: jest.fn(() => false),
    ScreenContainer: View,
    Screen: View,
    NativeScreen: View,
    NativeScreenContainer: View,
    NativeScreenNavigationContainer: View,
    ScreenStack: View,
    ScreenStackHeaderConfig: View,
    ScreenStackHeaderSubview: View,
    ScreenStackHeaderRightView: View,
    ScreenStackHeaderLeftView: View,
    ScreenStackHeaderCenterView: View,
    ScreenStackHeaderBackButtonImage: View,
    SearchBar: View,
    shouldUseActivityState: true,
  };
});

// react-native-reanimated
jest.mock("react-native-reanimated", () => {
  const View = require("react-native").View;
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (component: any) => component,
      addWhitelistedUIProps: jest.fn(),
      addWhitelistedNativeProps: jest.fn(),
    },
    useSharedValue: jest.fn((init: any) => ({ value: init })),
    useAnimatedStyle: jest.fn(() => ({})),
    withTiming: jest.fn((v: any) => v),
    withSpring: jest.fn((v: any) => v),
    withDelay: jest.fn((_d: any, v: any) => v),
    withSequence: jest.fn((...args: any[]) => args[args.length - 1]),
    withRepeat: jest.fn((v: any) => v),
    useAnimatedRef: jest.fn(() => ({ current: null })),
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      bezier: jest.fn(() => jest.fn()),
    },
    FadeIn: { duration: jest.fn().mockReturnThis() },
    FadeOut: { duration: jest.fn().mockReturnThis() },
    Layout: { duration: jest.fn().mockReturnThis() },
    SlideInRight: { duration: jest.fn().mockReturnThis() },
    SlideOutLeft: { duration: jest.fn().mockReturnThis() },
    View,
  };
});

// @react-navigation/native
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  const View = require("react-native").View;
  return {
    NavigationContainer: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
    }),
    useRoute: () => ({
      params: {},
    }),
    useFocusEffect: jest.fn(),
    useIsFocused: jest.fn(() => true),
  };
});

// react-native-vector-icons
jest.mock("react-native-vector-icons/MaterialIcons", () => "Icon");
jest.mock("react-native-vector-icons/Ionicons", () => "Icon");

// @shopify/react-native-skia
jest.mock("@shopify/react-native-skia", () => ({
  Canvas: "Canvas",
  Circle: "Circle",
  Path: "Path",
  Skia: {
    Path: { Make: jest.fn() },
    Color: jest.fn(),
  },
}));

// victory-native
jest.mock("victory-native", () => ({
  VictoryChart: "VictoryChart",
  VictoryLine: "VictoryLine",
  VictoryBar: "VictoryBar",
  VictoryAxis: "VictoryAxis",
  VictoryTheme: { material: {} },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("App", () => {
  it("should render without crashing", () => {
    const { toJSON } = render(<App />);
    expect(toJSON()).not.toBeNull();
  });

  it("should display the app title 'Sidecoin'", () => {
    render(<App />);
    expect(screen.getByText("Sidecoin")).toBeTruthy();
  });

  it("should display the subtitle 'eCash Drivechain Wallet'", () => {
    render(<App />);
    expect(screen.getByText("eCash Drivechain Wallet")).toBeTruthy();
  });

  it("should display 'Fork Countdown' section", () => {
    render(<App />);
    expect(screen.getByText("Fork Countdown")).toBeTruthy();
  });

  it("should display the fork activation timestamp", () => {
    render(<App />);
    expect(screen.getByText("2026-08-21T15:00:00Z")).toBeTruthy();
  });

  it("should display 'Chain' section", () => {
    render(<App />);
    expect(screen.getByText("Chain")).toBeTruthy();
  });

  it("should display PoW algorithm as sha256d", () => {
    render(<App />);
    expect(screen.getByText("PoW: sha256d")).toBeTruthy();
  });

  it("should display BIP-300 status", () => {
    render(<App />);
    expect(screen.getByText("BIP-300: Active")).toBeTruthy();
  });

  it("should display BIP-301 status", () => {
    render(<App />);
    expect(screen.getByText("BIP-301: Active")).toBeTruthy();
  });

  it("should display the Sidechains section with count", () => {
    render(<App />);
    expect(screen.getByText("Sidechains (8)")).toBeTruthy();
  });

  it("should display Thunder Network sidechain", () => {
    render(<App />);
    expect(screen.getByText(/#0 Thunder Network/)).toBeTruthy();
  });

  it("should display zSide sidechain", () => {
    render(<App />);
    expect(screen.getByText(/#1 zSide/)).toBeTruthy();
  });

  it("should display BitNames sidechain", () => {
    render(<App />);
    expect(screen.getByText(/#2 BitNames/)).toBeTruthy();
  });

  it("should display BitAssets sidechain", () => {
    render(<App />);
    expect(screen.getByText(/#3 BitAssets/)).toBeTruthy();
  });

  it("should display Photon sidechain", () => {
    render(<App />);
    expect(screen.getByText(/#4 Photon/)).toBeTruthy();
  });

  it("should display Truthcoin sidechain", () => {
    render(<App />);
    expect(screen.getByText(/#5 Truthcoin/)).toBeTruthy();
  });

  it("should display CoinShift sidechain", () => {
    render(<App />);
    expect(screen.getByText(/#6 CoinShift/)).toBeTruthy();
  });

  it("should display reserved sidechain slot", () => {
    render(<App />);
    expect(screen.getByText(/#7 Sidechain #8/)).toBeTruthy();
  });

  it("should display workspace validation success", () => {
    render(<App />);
    expect(screen.getByText("Workspace")).toBeTruthy();
    expect(screen.getByText("✅ @sidecoin/shared linked and working")).toBeTruthy();
  });

  it("should display the block height estimate", () => {
    render(<App />);
    // Block ~964,000 formatted with toLocaleString
    expect(screen.getByText(/964/)).toBeTruthy();
  });
});
