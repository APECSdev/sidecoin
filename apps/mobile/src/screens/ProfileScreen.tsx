// apps/mobile/src/screens/ProfileScreen.tsx
//
// The Sidecoin PROFILE screen — the wallet's public identity, managed by
// BitNames.
//
// WHAT THIS SCREEN SHOWS (all derived on-device, nothing fetched):
//   • the BitNames name slot address — deriveDrivechainAddress(mnemonic, 1),
//     the same slot-2 (bitnames) drivechain address RenderScreen/SidechainsScreen
//     show. This is the address a BitNames registration pays to.
//   • the Founder identity key — the NIP-06 Nostr public key
//     (deriveNostrIdentityKey(mnemonic, 0).publicKeyHex), matching
//     SettingsScreen. It is PUBLIC by design and safe to copy/share.
//
// ⚠️  Only the PUBLIC half of the identity key is ever read here. The private
//     scalar returned by deriveNostrIdentityKey is discarded immediately and is
//     never logged, persisted, or transmitted.
//
// REGISTRATION IS NOT WIRED: BitNames name lookup/registration needs an
// indexer endpoint that the mobile client does not have a contract for yet.
// The name field is therefore a LOCAL, display-only draft input that is not
// saved and does not touch the chain. The UI says so explicitly.

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  deriveDrivechainAddress,
  deriveNostrIdentityKey,
} from "@sidecoin/shared";

import { GRAY, SC } from "../theme/colors";
import { loadWallet } from "../keystore";
import {
  Alert,
  Body,
  Card,
  Eyebrow,
  Field,
  Mono,
  Muted,
  Screen,
  SectionTitle,
  Subtitle,
  Title,
} from "../components/ui";

export function ProfileScreen(): React.JSX.Element {
  // BitNames slot address (drivechain index 1). null until derived.
  const [nameAddress, setNameAddress] = useState<string | null>(null);
  // NIP-06 public identity key. null until derived.
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  // Human-readable failure if either derivation throws.
  const [error, setError] = useState<string | null>(null);
  // Local-only display name draft. Never persisted, never submitted.
  const [draftName, setDraftName] = useState("");
  // Which value was most recently copied, for the confirmation line.
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const wallet = await loadWallet();
        if (cancelled) return;

        if (!wallet) {
          setError("No wallet is stored on this device.");
          return;
        }

        // Slot-2 (bitnames) drivechain address for the wallet's index 1.
        const address = deriveDrivechainAddress(wallet.mnemonic, 1);
        // Public half only — the private scalar is dropped here.
        const identity = deriveNostrIdentityKey(wallet.mnemonic, 0).publicKeyHex;

        if (cancelled) return;
        setNameAddress(address);
        setIdentityKey(identity);
        setError(null);
      } catch (err) {
        console.error("[ProfileScreen] identity derivation failed:", err);
        if (!cancelled) setError("Could not derive your BitNames identity.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const copy = useCallback((label: string, value: string) => {
    try {
      Clipboard.setString(value);
      setCopied(label);
    } catch (err) {
      console.error(`[ProfileScreen] failed to copy ${label}:`, err);
      setError("Could not copy to the clipboard.");
    }
  }, []);

  return (
    <Screen>
      <Eyebrow>Profile</Eyebrow>
      <Title>Profile</Title>
      <Subtitle>
        Your public identity, managed by BitNames. Derived from your wallet on
        this device.
      </Subtitle>

      {error ? <Alert tone="warning">{error}</Alert> : null}

      <Card tone="surface">
        <SectionTitle>BitNames name</SectionTitle>
        <Muted style={styles.cardNote}>
          The address your BitNames registration pays to (sidechain slot 2).
        </Muted>

        {nameAddress ? (
          <>
            <Mono style={styles.value} selectable>
              {nameAddress}
            </Mono>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy BitNames address"
              testID="profile-copy-address"
              onPress={() => copy("address", nameAddress)}
              style={styles.copyButton}
            >
              <Body style={styles.copyText}>Copy address</Body>
            </Pressable>
          </>
        ) : (
          <Muted style={styles.value}>Deriving…</Muted>
        )}
      </Card>

      <Card tone="surface">
        <SectionTitle>Founder identity key</SectionTitle>
        <Muted style={styles.cardNote}>
          Your public Nostr identity (NIP-06). Safe to share; it cannot spend
          your funds.
        </Muted>

        {identityKey ? (
          <>
            <Mono style={styles.value} selectable>
              {identityKey}
            </Mono>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy identity key"
              testID="profile-copy-identity"
              onPress={() => copy("identity", identityKey)}
              style={styles.copyButton}
            >
              <Body style={styles.copyText}>Copy identity key</Body>
            </Pressable>
          </>
        ) : (
          <Muted style={styles.value}>Deriving…</Muted>
        )}

        {copied ? (
          <View testID="profile-copied">
            <Muted style={styles.copiedNote}>
              Copied the {copied} to the clipboard.
            </Muted>
          </View>
        ) : null}
      </Card>

      <Card tone="inset">
        <SectionTitle>Register a name</SectionTitle>
        <Field
          label="Desired name"
          value={draftName}
          onChangeText={setDraftName}
          placeholder="e.g. satoshi"
          autoCapitalize="none"
        />
        <Muted style={styles.cardNote}>
          Local draft only. BitNames registration is not wired in this build —
          nothing is saved and no transaction is created.
        </Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardNote: {
    marginTop: 4,
    fontSize: 12,
  },
  value: {
    marginTop: 12,
    color: SC.text,
  },
  copyButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: GRAY[700],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyText: {
    fontWeight: "600",
  },
  copiedNote: {
    marginTop: 8,
    fontSize: 12,
    color: GRAY[400],
  },
});
