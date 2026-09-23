// apps/mobile/src/screens/ExploreScreen.tsx
//
// The "Explore" bottom tab — a MINIMAL in-app browser.
//
// Operator directive: no descriptions, no titles, no marketing copy. Just a
// URL field with basic navigation controls, an empty WebView, and a few
// default/recent bookmarks rendered as a strip over the WebView.
//
// The WebView is REAL (react-native-webview). It starts empty — no page is
// loaded until the user enters a URL or taps a bookmark.
//
// BOOKMARK POLICY: only URLs that were verified to return HTTP 200 are listed.
// The hosts that appeared in the earlier mock (bitnames.app,
// thunder.drivechain.dev) do NOT resolve and were deliberately dropped rather
// than shipped as dead links.

import React, { useCallback, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

import { GRAY, SC } from "../theme/colors";

/** A bookmarked destination. Every `url` here was verified to return HTTP 200. */
interface Bookmark {
  /** Short label shown on the chip. */
  label: string;
  /** Absolute https URL loaded into the WebView. */
  url: string;
}

/**
 * Default / recently-visited bookmarks. Only verified-reachable hosts are
 * listed; see the header note. Ordered most-relevant first.
 */
const BOOKMARKS: Bookmark[] = [
  { label: "SupaQt", url: "https://supaqt.com" },
  { label: "eCash", url: "https://ecash.com" },
  { label: "Drivechain", url: "https://drivechain.dev/config" },
  { label: "eCash Farm", url: "https://ecashfarm.com" },
];

/**
 * Turn typed text into a loadable URL. Bare hosts get https://, and anything
 * that looks like a search phrase is sent to DuckDuckGo. Returns null for
 * empty input so callers can skip navigation.
 */
function normaliseInput(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;

  // Looks like a URL (has a scheme, or a dotted host with no spaces).
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[^\s/]+\.[^\s/]+/.test(value)) return `https://${value}`;

  // Otherwise treat it as a search query.
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

export function ExploreScreen(): React.JSX.Element {
  // Text currently in the address bar (what the user is typing or what the
  // page reported back after a navigation).
  const [address, setAddress] = useState("");
  // The URL actually handed to the WebView. null = nothing loaded yet, which
  // is the "empty webview" start state.
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const webRef = useRef<WebView>(null);

  /** Load a URL into the WebView and mirror it into the address bar. */
  const load = useCallback((url: string) => {
    Keyboard.dismiss();
    setAddress(url);
    setCurrentUrl(url);
  }, []);

  /** Submit whatever is in the address bar. */
  const submit = useCallback(() => {
    const url = normaliseInput(address);
    if (url) load(url);
  }, [address, load]);

  /**
   * Keep the chrome in sync with the page: the address bar follows in-page
   * navigation, and the back/forward buttons enable only when the WebView can
   * actually move in that direction.
   */
  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    if (!nav.loading) setAddress(nav.url);
    setCanGoBack(nav.canGoBack);
    setCanGoForward(nav.canGoForward);
  }, []);

  return (
    <View style={styles.root}>
      {/* Address bar + basic controls. One compact row, no chrome beyond it. */}
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          disabled={!canGoBack}
          onPress={() => webRef.current?.goBack()}
          style={[styles.iconButton, !canGoBack ? styles.iconDisabled : null]}
        >
          <MaterialIcons
            name="chevron-left"
            size={22}
            color={canGoBack ? SC.text : GRAY[600]}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Forward"
          disabled={!canGoForward}
          onPress={() => webRef.current?.goForward()}
          style={[styles.iconButton, !canGoForward ? styles.iconDisabled : null]}
        >
          <MaterialIcons
            name="chevron-right"
            size={22}
            color={canGoForward ? SC.text : GRAY[600]}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reload"
          onPress={() => webRef.current?.reload()}
          style={styles.iconButton}
        >
          <MaterialIcons name="refresh" size={20} color={SC.text} />
        </Pressable>

        <TextInput
          testID="explore-address"
          value={address}
          onChangeText={setAddress}
          onSubmitEditing={submit}
          placeholder="Enter a URL"
          placeholderTextColor={GRAY[600]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          style={styles.input}
        />
      </View>

      {/* Bookmark strip. Sits above the WebView so it is visible while empty. */}
      <View style={styles.bookmarks}>
        {BOOKMARKS.map((bookmark) => (
          <Pressable
            key={bookmark.url}
            testID={`explore-bookmark-${bookmark.label}`}
            accessibilityRole="button"
            accessibilityLabel={bookmark.label}
            onPress={() => load(bookmark.url)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{bookmark.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.progressTrack}>
          <View style={styles.progressBar} />
        </View>
      ) : null}

      {/*
       * The WebView. `currentUrl === null` renders the empty state (no `source`
       * prop set), which is the required "show an empty webview" start.
       */}
      <View style={styles.viewport}>
        <WebView
          ref={webRef}
          testID="explore-webview"
          style={styles.webview}
          source={currentUrl ? { uri: currentUrl } : undefined}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={onNavigationStateChange}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          // Keep the browser state inside the app; no new activities.
          setSupportMultipleWindows={false}
        />

        {currentUrl === null ? (
          <View pointerEvents="none" style={styles.emptyOverlay}>
            <Text style={styles.emptyText}>No page loaded</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SC.bg,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRAY[800],
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  iconDisabled: {
    opacity: 0.5,
  },
  input: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    color: SC.text,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  bookmarks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chip: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: GRAY[800],
    backgroundColor: GRAY[900],
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: SC.text,
    fontSize: 13,
    fontWeight: "600",
  },
  progressTrack: {
    height: 2,
    backgroundColor: "transparent",
  },
  progressBar: {
    height: 2,
    width: "60%",
    backgroundColor: SC.primary,
  },
  viewport: {
    flex: 1,
    backgroundColor: SC.bg,
  },
  webview: {
    flex: 1,
    backgroundColor: SC.bg,
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: GRAY[600],
    fontSize: 14,
  },
});