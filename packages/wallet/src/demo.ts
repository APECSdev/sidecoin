// packages/wallet/src/demo.ts
//
// Demo Mode is display-only. Never use demo balances, demo deposits,
// demo UTXOs, or demo addresses for signing, sending, swapping, splitting,
// settlement, or broadcast.

export const DEMO_MODE_STORAGE_KEY = "sidecoin-demo-mode";
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

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isDemoModeEnabled(): boolean {
  return getStorage()?.getItem(DEMO_MODE_STORAGE_KEY) === "1";
}

export function setDemoMode(enabled: boolean): void {
  const storage = getStorage();

  if (storage) {
    if (enabled) {
      storage.setItem(DEMO_MODE_STORAGE_KEY, "1");
    } else {
      storage.removeItem(DEMO_MODE_STORAGE_KEY);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DEMO_MODE_EVENT, {
        detail: { enabled },
      }),
    );
  }
}

export function toggleDemoMode(): boolean {
  const next = !isDemoModeEnabled();
  setDemoMode(next);
  return next;
}
