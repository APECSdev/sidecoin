// apps/mobile/src/__tests__/App.test.tsx
//
// Tests for the root App component and the navigation shell.
//
// PHASE 2 NOTE: App.tsx used to render the fork-countdown demo directly.
// It is now a provider shell around ./navigation/RootNavigator.tsx, and the
// old placeholder content moved verbatim into ./screens/DashboardScreen.tsx
// (covered by ./DashboardScreen.test.tsx). These tests therefore assert the
// shell wiring and the keystore gate: with no wallet in keychain the app must
// land on "onboarding" (parity with the Vue router beforeEach redirect in
// apps/wallet/src/router/index.ts).

import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import App from "../App";

// ---------------------------------------------------------------------------
// Keystore — the gate the shell reads at startup.
//
// jest.mock() factories are hoisted above all imports, so this mock is
// declared before `../App` is required and controls what hasWallet() returns.
// Individual tests override the resolved value to exercise both branches.
// ---------------------------------------------------------------------------
jest.mock("../keystore", () => ({
  hasWallet: jest.fn(async () => false),
  loadWallet: jest.fn(async () => null),
  saveWallet: jest.fn(async () => undefined),
  setWalletNetwork: jest.fn(async () => undefined),
  clearWallet: jest.fn(async () => undefined),
}));

import { hasWallet } from "../keystore";

// Demo Mode / theme persistence use AsyncStorage. The native module is absent
// in Jest, so provide an in-memory store (the real ../demo + ../theme helpers
// then stay under test).
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

// The dashboard (the Home tab) performs live API reads on mount. Stub them so
// the shell test does not hit the network; the dashboard's own behaviour is
// covered by ./DashboardScreen.test.tsx.
jest.mock("../api", () => {
  const actual = jest.requireActual("../api");
  return {
    ...actual,
    getSidechains: jest.fn(async () => []),
    getDeposits: jest.fn(async () => ({
      slot: 0,
      chainId: "chain-0",
      provisioned: false,
      deposits: [],
      nextCursor: null,
    })),
    getL1Balance: jest.fn(async () => null),
    getCoinNewsFeeds: jest.fn(async () => []),
    getCoinNewsPosts: jest.fn(async () => ({ feed: null, posts: [], next_cursor: null })),
    getMarketPrice: jest.fn(async () => null),
  };
});

// ---------------------------------------------------------------------------
// Mock native modules that crash in a Jest environment
//
// IMPORTANT: jest.mock() factories are hoisted above all imports.
// They cannot reference any imported variables (like `React`).
// Instead, use require() inline inside each factory.
// ---------------------------------------------------------------------------

// react-native-vision-camera — the QR scanner module is imported (though not
// mounted) via the Send screen, and the native module is absent in Jest.
jest.mock("react-native-vision-camera", () => ({
  Camera: () => null,
  useCameraDevice: () => null,
  useCameraPermission: () => ({
    hasPermission: false,
    requestPermission: async () => false,
  }),
  useCodeScanner: () => ({ codeTypes: ["qr"], onCodeScanned: () => {} }),
}));

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
//
// DarkTheme/DefaultTheme are part of the real module's public surface and are
// consumed by ../navigation/theme.ts. They must be present here or importing
// the theme throws "Cannot read properties of undefined (reading 'colors')".
// The theme object is captured so a test can assert NavigationContainer
// actually receives it (the white-gutter dark-mode regression).
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  const View = require("react-native").View;
  const colors = {
    primary: "#F7931A",
    background: "#0D1117",
    card: "#0D1117",
    text: "#E6EDF3",
    border: "#1f2937",
    notification: "#F85149",
  };
  // Minimal ref stub: ../navigation/ref.ts calls
  // createNavigationContainerRef() at module scope, and RootNavigator
  // subscribes via addListener("state") and reads getRootState().
  // Models the exact tab-focused state that triggered the double-FAB bug:
  //
  //   • getRootState()     -> "main"       (the root stack screen)
  //   • getCurrentRoute()  -> "platforms"  (the DEEPEST focused route)
  //
  // RootNavigator must gate the stack-level FAB on the ROOT route. Reading the
  // deepest route made `stackRoute` become "platforms", which is absent from
  // FAB_HIDDEN_ROUTES, so a SECOND FAB rendered over the tab shell and covered
  // the Platforms tab. With this stub the fixed code yields one FAB; reverting
  // to getCurrentRoute yields two and fails the regression test below.
  const navRefStub = {
    getRootState: () => ({
      routes: [{ name: "main" }],
      index: 0,
    }),
    getCurrentRoute: () => ({ name: "platforms" }),
    addListener: jest.fn(() => jest.fn()),
  };
  return {
    NavigationContainer: ({ children, theme, ...props }: any) => {
      // Record the theme for assertions without rendering it.
      (globalThis as any).__navTheme = theme;
      return React.createElement(View, props, children);
    },
    DefaultTheme: { dark: false, colors, fonts: {} },
    DarkTheme: { dark: true, colors, fonts: {} },
    createNavigationContainerRef: () => navRefStub,
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

// @react-native-clipboard/clipboard — resolves a native TurboModule that does
// not exist under Jest; the ported Receive/Sidechains/Toolbox screens import it
// at module scope, so it must be stubbed for the shell to mount.
jest.mock("@react-native-clipboard/clipboard", () => ({
  __esModule: true,
  default: { setString: jest.fn(), getString: jest.fn(async () => "") },
}));

// react-native-qrcode-svg — renders an SVG tree via react-native-svg; the
// Receive screen mounts it, so stub it to a plain host element.
jest.mock("react-native-qrcode-svg", () => "QRCode");

// react-native-webview — ExploreScreen (an always-registered tab) imports it
// at module scope, and its native RNCWebViewModule is absent under Jest.
jest.mock("react-native-webview", () => {
  const React = require("react");
  const View = require("react-native").View;
  const WebView = React.forwardRef((props: any, _ref: any) =>
    React.createElement(View, props),
  );
  WebView.displayName = "WebView";
  return { __esModule: true, WebView, default: WebView };
});

// @react-navigation/bottom-tabs — the real implementation needs the full
// native navigator tree; render the tab screens inline for assertions.
// BottomTabBar is real-module API consumed by RootNavigator's tabBar render
// prop (it measures the bar so the FAB can float above it).
jest.mock("@react-navigation/bottom-tabs", () => {
  const React = require("react");
  const View = require("react-native").View;
  const fakeBar = (props: any) => React.createElement(View, props);
  return {
    createBottomTabNavigator: () => {
      // The real Navigator renders the tab bar via its `tabBar` prop and
      // reports the rendered height through an onLayout callback. Mirror that
      // contract so FabMenu receives a measured height instead of its default.
      const Navigator = ({ children, tabBar }: any) =>
        React.createElement(
          View,
          null,
          children,
          typeof tabBar === "function"
            ? tabBar({
                state: { routes: [] },
                descriptors: {},
                navigation: {},
                insets: { top: 0, right: 0, bottom: 0, left: 0 },
              })
            : null,
        );
      const Screen = ({ component: Component }: any) =>
        React.createElement(Component);
      return { Navigator, Screen };
    },
    BottomTabBar: fakeBar,
  };
});

// @react-navigation/native-stack — same rationale as bottom-tabs above.
//
// REGRESSION NOTE: the mock also records every registered route name into
// `registeredStackRoutes`. React Navigation silently drops a navigation
// action that targets a route which is not registered, which is exactly how
// the "Import does nothing" bug presented on device: when no wallet was
// stored only the "onboarding" route existed, so OnboardingScreen's
// navigation.replace("main") was a no-op. Asserting the registration set
// keeps every route mounted regardless of the keystore gate.
jest.mock("@react-navigation/native-stack", () => {
  const React = require("react");
  const View = require("react-native").View;
  const routes: string[] = (globalThis as any).__stackRoutes ?? [];
  (globalThis as any).__stackRoutes = routes;
  return {
    createNativeStackNavigator: () => {
      const Navigator = ({ children }: any) =>
        React.createElement(View, null, children);
      const Screen = ({ name, component: Component }: any) => {
        if (!routes.includes(name)) routes.push(name);
        return React.createElement(Component);
      };
      return { Navigator, Screen };
    },
  };
});

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
  it("should render without crashing", async () => {
    const { toJSON } = render(<App />);
    expect(toJSON()).not.toBeNull();
    // Flush the keystore effect so its state updates are act()-wrapped.
    await waitFor(() => {
      expect(hasWallet).toHaveBeenCalled();
    });
  });

  it("should gate on the keystore at startup", async () => {
    render(<App />);
    // hasWallet() runs in an effect; flush it so the setBooting/setWalletPresent
    // state updates are wrapped in act() and do not warn.
    await waitFor(() => {
      expect(hasWallet).toHaveBeenCalled();
    });
  });

  it("should land on onboarding when no wallet is stored", async () => {
    render(<App />);
    // The splash is replaced once hasWallet() resolves.
    await waitFor(() => {
      expect(screen.getByText("Set up your wallet")).toBeTruthy();
    });
  });

  // REGRESSION: importing a seed phrase did nothing on device because the
  // navigator only registered "onboarding" while no wallet was stored, so
  // OnboardingScreen's navigation.replace("main") had no route to land on.
  // React Navigation drops such an action silently. Every route must stay
  // registered; the keystore gate only chooses the initial route.
  it("should register every route while gated on onboarding", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Set up your wallet")).toBeTruthy();
    });
    const routes: string[] = (globalThis as any).__stackRoutes ?? [];
    for (const name of [
      "onboarding",
      "main",
      "send",
      "receive",
      "settings",
      "qr-scan",
      "swap",
      "markets",
      "platform-detail",
      "hardware",
      "toolbox",
      "pro",
      "profile",
    ]) {
      expect(routes).toContain(name);
    }
  });

  // REGRESSION (white border): NavigationContainer applies React Navigation's
  // light DefaultTheme (colors.background = rgb(242,242,242)) unless a theme is
  // passed. That painted the navigator gutter white in dark mode. App.tsx must
  // pass the Sidecoin dark theme.
  it("should give NavigationContainer a dark theme, not the light default", async () => {
    render(<App />);
    await waitFor(() => {
      expect(hasWallet).toHaveBeenCalled();
    });
    const theme: any = (globalThis as any).__navTheme;
    expect(theme).toBeTruthy();
    expect(theme.dark).toBe(true);
    // The exact value that used to leak through as a white border.
    expect(theme.colors.background).not.toBe("rgb(242, 242, 242)");
    expect(theme.colors.background).toBe("#0D1117");
  });

  it("should render the main tab shell when a wallet is stored", async () => {
    (hasWallet as jest.Mock).mockResolvedValueOnce(true);
    render(<App />);
    // DashboardScreen (the Home tab) is the landing surface for a stored wallet.
    await waitFor(() => {
      expect(
        screen.getAllByText("Drivechains Financial Hub").length,
      ).toBeGreaterThan(0);
    });
  });

  // REGRESSION (double FAB / blocked tab): RootNavigator read the DEEPEST
  // focused route via navigationRef.getCurrentRoute(). While a tab was
  // focused that returned the tab's own name (e.g. "platforms"), which is not
  // in FAB_HIDDEN_ROUTES, so the stack-level FAB rendered a SECOND floating
  // button over the tab shell. Positioned at the bottom inset, that duplicate
  // sat on the rightmost tab and made Platforms untappable. Reading the ROOT
  // stack route (getRootState → "main") keeps the second FAB hidden. Exactly
  // one FAB must exist on the tab shell.
  it("should render exactly one FAB on the tab shell", async () => {
    (hasWallet as jest.Mock).mockResolvedValueOnce(true);
    render(<App />);
    await waitFor(() => {
      expect(
        screen.getAllByText("Drivechains Financial Hub").length,
      ).toBeGreaterThan(0);
    });
    expect(screen.getAllByTestId("fab-container")).toHaveLength(1);
  });
});
