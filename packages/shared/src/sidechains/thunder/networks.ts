// packages/shared/src/sidechains/thunder/networks.ts
//
// Per-network Thunder deployment facts, live-verified 2026-11-27 (with the
// 2026-11-27 evening retirement of betanet — its L1 infrastructure went
// dark: esplora.beta.ecash.ninja connection-refused; owner order):
//
//   mainnet (eCash) — THE deployment. Index (drivechain-esplora):
//     https://seed.ecash.eu.com/thunder (tip 429 at verification, 3/3
//     probes; slot 9 active since mainchain height 978,324). Node v0.19.3
//     (drivechain.dev/config image sha-b0d3544) → key scheme thunder-v19.
//     L1 index: https://esplora.ecash.ninja (tip 985,975 at verification)
//     / https://esplora.ecash.com. Deposit params: OP_DRIVECHAIN = 0xb7
//     (OP_NOP8), replay nLockTime 499,999,998 — already encoded in
//     packages/shared/src/tx/deposit.ts getDepositNetworkParams.
//
//   betanet — RETIRED 2026-11-27. The L1 chain's public index went dark
//     (esplora.beta.ecash.ninja unreachable; the owner confirmed it is not
//     coming back). The Thunder index (seed.beta.ecash.eu.com/thunder, tip
//     2422, v18 keys) still answers but is unreachable-without-its-L1 and
//     is kept here as historical record only — backendAvailable: false.
//
//   signet (L2L Signet) — Thunder node v0.19.3 exists (P2P
//     node.signet.drivechain.info:4009, QUIC) but there is NO public RPC
//     (port 6009 unreachable) and NO esplora index — nothing a third-party
//     wallet can integrate against yet. Blocked on L2L exposing a backend.
//     Key scheme, for when it unblocks: thunder-v19.

import type { ThunderKeySchemeId } from "./keys";

/** The L1 networks a Thunder account can live on (parent mainchains). */
export type ThunderNetworkId = "betanet" | "mainnet" | "signet";

export interface ThunderNetworkConfig {
  /** drivechain-esplora index base URL, including any mount path. */
  thunderEsploraBaseUrl: string;
  /** The L1 (mainchain) Esplora base — same mapping as the wallet's
   * ESPLORA_BASES, restated here so the Thunder layer is self-contained. */
  mainchainEsploraBaseUrl: string;
  /** Key scheme the deployment's node generation uses. */
  keyScheme: ThunderKeySchemeId;
  /** Whether a third-party wallet can actually reach a Thunder backend. */
  backendAvailable: boolean;
}

export const THUNDER_NETWORKS: Record<ThunderNetworkId, ThunderNetworkConfig> = {
  betanet: {
    // RETIRED 2026-11-27 — historical record; unreachable in practice
    // (dead L1) and never returned as a usable deployment.
    thunderEsploraBaseUrl: "https://seed.beta.ecash.eu.com/thunder",
    mainchainEsploraBaseUrl: "https://esplora.beta.ecash.ninja",
    keyScheme: "thunder-v18",
    backendAvailable: false,
  },
  mainnet: {
    thunderEsploraBaseUrl: "https://seed.ecash.eu.com/thunder",
    mainchainEsploraBaseUrl: "https://esplora.ecash.ninja",
    keyScheme: "thunder-v19",
    backendAvailable: true,
  },
  signet: {
    thunderEsploraBaseUrl: "",
    mainchainEsploraBaseUrl: "https://esplora.signet.drivechain.info",
    keyScheme: "thunder-v19",
    backendAvailable: false,
  },
};

/**
 * The Thunder deployment a wallet's L1 network maps to. "l2l-signet" (the
 * full NetworkId member) maps to the signet Thunder; anything else has no
 * Thunder (no sidechains on Bitcoin-family testnets other than L2L signet).
 */
export function thunderNetworkFor(network: string): ThunderNetworkId | null {
  switch (network) {
    case "betanet":
      return "betanet";
    case "mainnet":
      return "mainnet";
    case "signet":
    case "l2l-signet":
      return "signet";
    default:
      return null;
  }
}
