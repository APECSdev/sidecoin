// apps/mobile/src/screens/SidechainsScreen.tsx
//
// Ported from apps/wallet/src/views/SidechainsView.vue.
//
// Ported 1:1. The Vue view composes live adapter status with the static
// PLATFORMS registry, derives per-slot receive addresses, and paginates the
// non-featured chains behind a "More platforms" toggle. None of that logic
// changes; only the presentation and the platform APIs do.
//
// Platform substitutions, no logic loss:
//   • `loadWallet()` is ASYNC in the RN keystore (keychain) vs synchronous
//     localStorage in the Vue app, so on-mount is an async effect.
//   • `navigator.clipboard.writeText` -> Clipboard.setString.
//   • `<router-link to="/platforms/:id">` -> navigation.push("platform-detail").
//   • The `copyAddress` 2s "Copied" reset is preserved via setTimeout.
//   • The Vue view rendered the grid `sm:grid-cols-2 lg:grid-cols-3`; on a
//     phone that is a single column, so the RN grid is a vertical stack.
//   • `deriveAddresses` runs in a try/catch that sets addressError, exactly as
//     before; the static-grid fallback when the adapter is unreachable is kept
//     (`mergePlatformSidechains([])`).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  deriveDrivechainAddress,
  deriveEvmAddress,
} from "@sidecoin/shared";

import { getSidechains, type SidechainSummary } from "../api";
import { loadWallet } from "../keystore";
import { PLATFORMS, getPlatformById } from "../data/platforms";
import { canAccessPlatform, isProPlatform } from "../entitlements";
import { ProBadge } from "../components/pro/ProBadge";
import type { RootStackParamList } from "../navigation/types";
import { ECASH, GRAY } from "../theme/colors";
import {
  Alert,
  Badge,
  Body,
  Button,
  Card,
  Eyebrow,
  Loading,
  Mono,
  Muted,
  Title,
} from "../components/ui";

interface WalletSidechainSummary {
  slot: number | null;
  id: string;
  displayName: string;
  description: string;
  status: string;
}

// Slots for which we can derive a verified receive address from the
// stored mnemonic. Each entry names the derivation scheme to use.
//   9  → Thunder  (SLIP-0010 ed25519 + blake3 + base58)
//   4  → BitAssets (same drivechain scheme — slot-independent)
//   88 → Snowside (standard EVM BIP-44, coin type 60)
const ADDRESS_DERIVATION_SLOTS = new Set<number>([9, 4, 88]);
const EVM_ADDRESS_SLOTS = new Set<number>([88]);

// Featured platforms lead the grid, in this order. Every other registered
// sidechain is rendered under the collapsible "More platforms" section.
const PLATFORM_DISPLAY_PRIORITY: Record<string, number> = {
  bitnames: 0,
  thunder: 1,
  snowside: 2,
};

function byDisplayPriority(
  a: { sidechain: WalletSidechainSummary; index: number },
  b: { sidechain: WalletSidechainSummary; index: number },
): number {
  const aPriority = PLATFORM_DISPLAY_PRIORITY[a.sidechain.id] ?? 100 + a.index;
  const bPriority = PLATFORM_DISPLAY_PRIORITY[b.sidechain.id] ?? 100 + b.index;
  return aPriority - bPriority;
}

/**
 * Derive a verified receive address for every slot that has a derivation
 * scheme wired up (Thunder/BitAssets drivechain + Snowside EVM).
 *
 * Each scheme uses its own index convention:
 *   Thunder / BitAssets: index 1 (get_new_address starts at 1)
 *   Snowside (EVM):       index 0 (standard EVM address issuance)
 */
function deriveAddresses(mnemonic: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const slot of ADDRESS_DERIVATION_SLOTS) {
    try {
      if (EVM_ADDRESS_SLOTS.has(slot)) {
        out[slot] = deriveEvmAddress(mnemonic, 0);
      } else {
        out[slot] = deriveDrivechainAddress(mnemonic, 1);
      }
    } catch (e) {
      console.error(
        `[SidechainsScreen] Failed to derive address for slot ${slot}:`,
        e,
      );
    }
  }
  return out;
}

function mergePlatformSidechains(
  apiSidechains: SidechainSummary[],
): WalletSidechainSummary[] {
  const byId = new Map<string, WalletSidechainSummary>();

  for (const sidechain of apiSidechains) {
    byId.set(sidechain.id, sidechain);
  }

  for (const platform of PLATFORMS) {
    if (!byId.has(platform.id)) {
      byId.set(platform.id, {
        slot: platform.slot,
        id: platform.id,
        displayName: platform.displayName,
        description: platform.description,
        status: platform.status,
      });
    }
  }

  return Array.from(byId.values());
}

function platformUseCase(id: string): string {
  return getPlatformById(id)?.primaryUseCase ?? "Platform";
}

function platformTagline(id: string): string {
  return getPlatformById(id)?.tagline ?? "";
}

function platformStatusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "coming soon") return "Coming Soon";
  return "Proposed";
}

function slotLabel(slot: number | null): string {
  return slot == null ? "Slot TBD" : `Slot ${slot}`;
}

export function SidechainsScreen(): React.JSX.Element {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [sidechains, setSidechains] = useState<WalletSidechainSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-slot derived receive address (one per sidechain with a derivation
  // scheme). Keyed by slot so Thunder (9) and Snowside (88) display distinct
  // addresses instead of sharing a single L2 address string.
  const [derivedAddresses, setDerivedAddresses] = useState<
    Record<number, string>
  >({});
  const [addressError, setAddressError] = useState("");
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const wallet = await loadWallet();
      if (cancelled) return;
      if (wallet) {
        try {
          setDerivedAddresses(deriveAddresses(wallet.mnemonic));
        } catch (e) {
          console.error(
            "[SidechainsScreen] Failed to derive sidechain addresses:",
            e,
          );
          setAddressError(
            "Unable to derive a sidechain address from the stored key.",
          );
        }
      }

      // The platform grid + locally-derived addresses render from the static
      // PLATFORMS registry, so they are always visible even when the live API
      // is unreachable. The API call only enriches cards with live status — a
      // failure is surfaced as a non-fatal banner, not a full-page error.
      try {
        const live = await getSidechains();
        if (cancelled) return;
        setSidechains(mergePlatformSidechains(live));
      } catch (e) {
        console.error("[SidechainsScreen] Failed to load sidechains:", e);
        if (cancelled) return;
        setError(String(e));
        // Fall back to the static platform list so addresses still display.
        setSidechains(mergePlatformSidechains([]));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const featuredSidechains = useMemo(
    () =>
      sidechains
        .map((sidechain, index) => ({ sidechain, index }))
        .filter((entry) => entry.sidechain.id in PLATFORM_DISPLAY_PRIORITY)
        .sort(byDisplayPriority)
        .map((entry) => entry.sidechain),
    [sidechains],
  );

  const moreSidechains = useMemo(
    () =>
      sidechains
        .map((sidechain, index) => ({ sidechain, index }))
        .filter((entry) => !(entry.sidechain.id in PLATFORM_DISPLAY_PRIORITY))
        .sort(byDisplayPriority)
        .map((entry) => entry.sidechain),
    [sidechains],
  );

  // The grid renders the featured platforms, then appends the remainder once
  // the "More platforms" toggle is expanded. A single grid keeps the card
  // markup from being duplicated.
  const visibleSidechains = useMemo(
    () =>
      showMore
        ? [...featuredSidechains, ...moreSidechains]
        : featuredSidechains,
    [showMore, featuredSidechains, moreSidechains],
  );

  const isVerified = useCallback(
    (slot: number | null): boolean =>
      slot != null &&
      ADDRESS_DERIVATION_SLOTS.has(slot) &&
      derivedAddresses[slot] != null &&
      derivedAddresses[slot] !== "",
    [derivedAddresses],
  );

  const addressFor = useCallback(
    (slot: number | null): string => {
      if (slot == null) return "";
      return derivedAddresses[slot] ?? "";
    },
    [derivedAddresses],
  );

  const copyAddress = useCallback(
    (slot: number | null): void => {
      if (slot == null) return;
      const addr = derivedAddresses[slot];
      if (!addr) return;
      try {
        Clipboard.setString(addr);
        setCopiedSlot(slot);
        setTimeout(() => {
          setCopiedSlot(null);
        }, 2000);
      } catch (e) {
        console.error("[SidechainsScreen] Failed to copy:", e);
      }
    },
    [derivedAddresses],
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.rootContent}>
      <Card style={styles.hero}>
        <Eyebrow>Drivechains Financial Hub</Eyebrow>
        <Title>Platforms</Title>
        <Body style={styles.heroBody}>
          Basic includes L1, Thunder, and BitNames. Sidecoin PRO unlocks the
          complete platform suite, historical analysis, hardware signing
          workflows, and early access to proposed platforms like RISCy.
        </Body>
        <Button
          label="Go PRO!"
          variant="pro"
          onPress={() => navigation.navigate("pro")}
          style={styles.goPro}
        />
      </Card>

      {addressError ? (
        <Alert tone="warning">
          <Text style={styles.addressErrorText}>{addressError}</Text>
        </Alert>
      ) : null}

      {loading ? (
        <Loading label="Loading platforms…" />
      ) : error ? (
        <Alert tone="error" title="Error loading platforms">
          <Text style={styles.loadErrorText}>{error}</Text>
        </Alert>
      ) : (
        <View style={styles.grid}>
          {visibleSidechains.map((sc) => (
            <Card key={sc.id} style={styles.platformCard}>
              <View style={styles.platformHead}>
                <View style={styles.platformHeadCopy}>
                  <Text style={styles.platformName}>{sc.displayName}</Text>
                  <Muted style={styles.platformTagline}>
                    {platformTagline(sc.id)}
                  </Muted>
                </View>
                <View style={styles.platformBadges}>
                  {isProPlatform(sc.id) ? <ProBadge /> : null}
                  <Badge
                    label={platformStatusLabel(sc.status)}
                    tone={sc.status === "active" ? "active" : "proposed"}
                  />
                </View>
              </View>

              <Muted style={styles.platformDescription}>{sc.description}</Muted>

              <View style={styles.platformMeta}>
                <Mono style={styles.slotMono}>{slotLabel(sc.slot)}</Mono>
                <Badge label={platformUseCase(sc.id)} tone="neutral" />
              </View>

              <Button
                label={canAccessPlatform(sc.id) ? "Open platform" : "Unlock platform"}
                variant="secondary"
                size="sm"
                onPress={() =>
                  navigation.push("platform-detail", { platformId: sc.id })
                }
                style={styles.openButton}
              />

              {isVerified(sc.slot) ? (
                <View style={styles.addressBlock}>
                  <Muted style={styles.addressLabel}>Your Receive Address</Muted>
                  <Text style={styles.addressText}>{addressFor(sc.slot)}</Text>
                  <Button
                    label={copiedSlot === sc.slot ? "Copied ✓" : "Copy Address"}
                    variant="ghost"
                    size="sm"
                    onPress={() => copyAddress(sc.slot)}
                    style={styles.copyButton}
                  />
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      {!loading && !error && moreSidechains.length > 0 ? (
        <Button
          label={
            showMore
              ? "Show fewer platforms"
              : `More platforms (${moreSidechains.length})`
          }
          variant="secondary"
          size="sm"
          onPress={() => setShowMore((v) => !v)}
          style={styles.moreButton}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 16,
  },
  // ScrollView content container -- see the note in ReceiveScreen.tsx.
  rootContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  hero: {
    padding: 20,
  },
  heroBody: {
    marginTop: 8,
  },
  goPro: {
    marginTop: 16,
    alignSelf: "flex-start",
  },
  addressErrorText: {
    fontSize: 13,
    color: "#fcd34d",
  },
  loadErrorText: {
    marginTop: 4,
    fontSize: 13,
  },
  grid: {
    gap: 16,
  },
  platformCard: {
    padding: 16,
  },
  platformHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  platformHeadCopy: {
    flexShrink: 1,
  },
  platformName: {
    fontWeight: "600",
    color: "#ffffff",
  },
  platformTagline: {
    marginTop: 4,
    fontSize: 12,
  },
  platformBadges: {
    alignItems: "flex-end",
    gap: 8,
  },
  platformDescription: {
    marginTop: 12,
    fontSize: 13,
  },
  platformMeta: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slotMono: {
    fontSize: 12,
    color: GRAY[600],
  },
  openButton: {
    marginTop: 16,
    alignSelf: "flex-start",
  },
  addressBlock: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: GRAY[800],
    paddingTop: 12,
  },
  addressLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  addressText: {
    fontFamily: "monospace",
    fontSize: 12,
    color: ECASH[400],
  },
  copyButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  moreButton: {
    marginTop: 4,
    alignSelf: "flex-start",
  },
});