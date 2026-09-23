// apps/mobile/src/demo.ts
//
// Demo Mode is display-only. Never use demo balances, demo deposits,
// demo UTXOs, or demo addresses for signing, sending, swapping, splitting,
// settlement, or broadcast.
//
// PORT NOTE: the Vue original reads localStorage synchronously and broadcasts
// a `window` CustomEvent. React Native has neither. AsyncStorage is async, so
// isDemoModeEnabled() returns a Promise and setDemoMode() is async. The
// CustomEvent is replaced by an in-memory listener set so mounted components
// (Dashboard) can reload when Demo Mode changes. Same behaviour, async API.

import AsyncStorage from "@react-native-async-storage/async-storage";

export const DEMO_MODE_STORAGE_KEY = "sidecoin-demo-mode";

// The Vue original names a DOM event; RN has no DOM. Keep the constant name
// for parity so callers that reference it still compile, but it is unused.
export const DEMO_MODE_EVENT = "sidecoin-demo-mode-changed";

export interface DemoDashboardPlatform {
  id: string;
  slot: number;
  displayName: string;
  description: string;
  status: "active" | "proposed";
  provisioned: boolean;
  depositCount: number;
  totalSats: bigint;
}

export const DEMO_L1_ADDRESS =
  "tb1qdemo7z8p4k4v4u7m2d8r9s0a3e6w9q2sidecoin";

export const DEMO_L1_BALANCE_SATS = 132257244n;

export const DEMO_DASHBOARD_ROWS: DemoDashboardPlatform[] = [
  {
    id: "thunder",
    slot: 9,
    displayName: "Thunder Network",
    description: "Fast payments and channel-based liquidity.",
    status: "active",
    provisioned: true,
    depositCount: 12,
    totalSats: 825000000n,
  },
  {
    id: "bitnames",
    slot: 2,
    displayName: "BitNames",
    description: "Names, identity, and human-readable records.",
    status: "active",
    provisioned: true,
    depositCount: 2,
    totalSats: 300000000n,
  },
  {
    id: "zside",
    slot: 98,
    displayName: "zSide",
    description: "Privacy-focused shielded transactions.",
    status: "active",
    provisioned: true,
    depositCount: 4,
    totalSats: 225000000n,
  },
  {
    id: "bitassets",
    slot: 4,
    displayName: "BitAssets",
    description: "Issued assets and token-style balances.",
    status: "active",
    provisioned: true,
    depositCount: 3,
    totalSats: 125000000n,
  },
  {
    id: "photon",
    slot: 99,
    displayName: "Photon",
    description: "Post-quantum experiment and cryptography platform.",
    status: "active",
    provisioned: true,
    depositCount: 1,
    totalSats: 50000000n,
  },
  {
    id: "truthcoin",
    slot: 13,
    displayName: "Truthcoin",
    description: "Prediction markets and oracle-driven outcomes.",
    status: "active",
    provisioned: true,
    depositCount: 3,
    totalSats: 250000000n,
  },
  {
    id: "coinshift",
    slot: 255,
    displayName: "CoinShift",
    description: "Cross-chain movement and atomic-swap style workflows.",
    status: "active",
    provisioned: true,
    depositCount: 2,
    totalSats: 275000000n,
  },
  {
    id: "riscy",
    slot: 3,
    displayName: "RISCy",
    description: "Proposed VM and programmable-contract platform.",
    status: "proposed",
    provisioned: false,
    depositCount: 1,
    totalSats: 250000000n,
  },
];

// ──────────────────────────────────────────────────────
// In-memory listener set — the RN replacement for the
// `window` CustomEvent dispatched by the Vue original.
// ──────────────────────────────────────────────────────
type DemoListener = (enabled: boolean) => void;
const listeners = new Set<DemoListener>();

/** Subscribe to Demo Mode changes. Returns an unsubscribe function. */
export function subscribeDemoMode(listener: DemoListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitDemoMode(enabled: boolean): void {
  for (const listener of listeners) {
    listener(enabled);
  }
}

export async function isDemoModeEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DEMO_MODE_STORAGE_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setDemoMode(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await AsyncStorage.setItem(DEMO_MODE_STORAGE_KEY, "1");
    } else {
      await AsyncStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    }
  } catch {
    // persist failure is non-fatal — the in-memory emit below still runs
  }

  emitDemoMode(enabled);
}

export async function toggleDemoMode(): Promise<boolean> {
  const next = !(await isDemoModeEnabled());
  await setDemoMode(next);
  return next;
}