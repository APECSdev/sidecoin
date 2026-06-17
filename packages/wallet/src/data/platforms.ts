// packages/wallet/src/data/platforms.ts
//
// Static platform definitions for Drivechain/sidechain detail pages.
// These pages are UI shells while the platform-specific wallet experiences
// are being designed and implemented.

export interface PlatformFeatureTab {
  id: string;
  label: string;
  title: string;
  body: string;
  bullets: string[];
}

export interface PlatformScaffold {
  id: string;
  slot: number;
  displayName: string;
  shortName: string;
  status: "active" | "proposed";
  tagline: string;
  description: string;
  primaryUseCase: string;
  featureTabs: PlatformFeatureTab[];
}

export const PLATFORMS: PlatformScaffold[] = [
  {
    id: "thunder",
    slot: 9,
    displayName: "Thunder Network",
    shortName: "Thunder",
    status: "active",
    tagline: "Fast payments and channel-based liquidity.",
    primaryUseCase: "Payments",
    description:
      "Thunder is the payments platform. The wallet UI will focus on fast transfers, channel liquidity, invoices, and payment status.",
    featureTabs: [
      {
        id: "payments",
        label: "Payments",
        title: "Fast payment flows",
        body: "Planned UI for Thunder payment UX: invoices, send/receive states, route status, and confirmation feedback.",
        bullets: ["Invoice-style requests", "Fast transfer status", "Payment history", "Liquidity-aware routing"],
      },
      {
        id: "channels",
        label: "Channels",
        title: "Channel management",
        body: "Future UI area for opening, monitoring, and closing payment channels.",
        bullets: ["Open channel", "Inbound/outbound capacity", "Channel health", "Close flow"],
      },
      {
        id: "liquidity",
        label: "Liquidity",
        title: "Liquidity controls",
        body: "Tools for understanding available liquidity before sending or receiving.",
        bullets: ["Available capacity", "Suggested actions", "Fee estimates", "Route diagnostics"],
      },
    ],
  },
  {
    id: "zside",
    slot: 98,
    displayName: "zSide",
    shortName: "zSide",
    status: "active",
    tagline: "Privacy-focused shielded transactions.",
    primaryUseCase: "Privacy",
    description:
      "zSide is the privacy platform. The wallet UI will focus on shielding, unshielding, privacy sets, and safe transaction habits.",
    featureTabs: [
      {
        id: "shield",
        label: "Shield",
        title: "Shield funds",
        body: "Planned UI for moving transparent coins into a privacy-preserving shielded context.",
        bullets: ["Shield amount", "Privacy warnings", "Fee review", "Confirmation state"],
      },
      {
        id: "private-send",
        label: "Private Send",
        title: "Private transfers",
        body: "Future UI for private recipient payments and transaction review.",
        bullets: ["Private address input", "Memo support placeholder", "Recipient validation", "Send review"],
      },
      {
        id: "unshield",
        label: "Unshield",
        title: "Return to transparent funds",
        body: "Planned UI for controlled unshielding with clear privacy warnings.",
        bullets: ["Unshield destination", "Amount controls", "Linkability warnings", "Review before broadcast"],
      },
    ],
  },
  {
    id: "bitnames",
    slot: 2,
    displayName: "BitNames",
    shortName: "BitNames",
    status: "active",
    tagline: "Names, identity, and human-readable records.",
    primaryUseCase: "Identity",
    description:
      "BitNames is the naming and identity platform. The wallet UI will focus on registering names, managing records, resolving identities, contacts, and messaging workflows.",
    featureTabs: [
      {
        id: "register",
        label: "Register",
        title: "Register a name",
        body: "Planned UI for searching and registering names directly from the wallet.",
        bullets: ["Name search", "Availability state", "Registration fee", "Renewal reminders"],
      },
      {
        id: "records",
        label: "Records",
        title: "Manage records",
        body: "Future UI for address records, profile records, and service endpoints.",
        bullets: ["Address records", "Profile metadata", "Service endpoints", "Record history"],
      },
      {
        id: "resolve",
        label: "Resolve",
        title: "Resolve identities",
        body: "Planned UI for looking up names before sending or verifying identities.",
        bullets: ["Name lookup", "Resolved addresses", "Trust hints", "Copy/share actions"],
      },
      {
        id: "contacts",
        label: "Contacts",
        title: "BitNames contacts",
        body: "Contact book area for resolved identities, payment addresses, and message shortcuts.",
        bullets: ["Contact search", "Identity status", "Payment shortcuts", "Message shortcuts"],
      },
      {
        id: "messages",
        label: "Messages",
        title: "BitNames messages",
        body: "Identity-based messaging tied to BitNames contacts and wallet records.",
        bullets: ["Identity selection", "Contact list", "Live conversation", "Composer availability"],
      },
    ],
  },
  {
    id: "bitassets",
    slot: 4,
    displayName: "BitAssets",
    shortName: "BitAssets",
    status: "active",
    tagline: "Issued assets and token-style balances.",
    primaryUseCase: "Assets",
    description:
      "BitAssets is the issued-assets platform. The wallet UI will focus on asset balances, transfers, issuance, and metadata.",
    featureTabs: [
      {
        id: "balances",
        label: "Balances",
        title: "Asset portfolio",
        body: "Planned UI for displaying issued assets alongside base-chain balances.",
        bullets: ["Asset list", "Metadata display", "Balance history", "Filtering"],
      },
      {
        id: "transfer",
        label: "Transfer",
        title: "Transfer assets",
        body: "Future UI for sending issued assets with clear fee and recipient review.",
        bullets: ["Recipient validation", "Asset selector", "Amount controls", "Transfer review"],
      },
      {
        id: "issue",
        label: "Issue",
        title: "Issue new assets",
        body: "Planned UI for issuer workflows once issuance rules are finalized.",
        bullets: ["Ticker/name", "Supply settings", "Issuer metadata", "Confirmation flow"],
      },
    ],
  },
  {
    id: "photon",
    slot: 99,
    displayName: "Photon",
    shortName: "Photon",
    status: "active",
    tagline: "Post-quantum experiment and cryptography platform.",
    primaryUseCase: "Post-quantum",
    description:
      "Photon is the post-quantum/cryptography platform. The wallet UI will focus on experimental address types, migration flows, and safety messaging.",
    featureTabs: [
      {
        id: "addresses",
        label: "Addresses",
        title: "Photon address management",
        body: "Planned UI for creating and managing Photon-specific receive addresses.",
        bullets: ["Address generation", "Format explanation", "Copy/QR actions", "Compatibility notes"],
      },
      {
        id: "migration",
        label: "Migration",
        title: "Migration flows",
        body: "Future UI for guided movement into Photon-safe outputs.",
        bullets: ["Migration checklist", "Fee review", "Batch support", "Status tracking"],
      },
      {
        id: "security",
        label: "Security",
        title: "Security posture",
        body: "Educational UI explaining what protections are active and what remains experimental.",
        bullets: ["Threat model", "Experimental warnings", "Verification steps", "Documentation links"],
      },
    ],
  },
  {
    id: "truthcoin",
    slot: 13,
    displayName: "Truthcoin",
    shortName: "Truthcoin",
    status: "active",
    tagline: "Prediction markets and oracle-driven outcomes.",
    primaryUseCase: "Markets",
    description:
      "Truthcoin is the prediction-market platform. The wallet UI will focus on markets, positions, decisions, and settlement states.",
    featureTabs: [
      {
        id: "markets",
        label: "Markets",
        title: "Market discovery",
        body: "Planned UI for browsing markets and understanding liquidity/status.",
        bullets: ["Market list", "Categories", "Volume/liquidity placeholders", "Resolution status"],
      },
      {
        id: "positions",
        label: "Positions",
        title: "Position tracking",
        body: "Future UI for active positions and settlement outcomes.",
        bullets: ["Open positions", "PnL placeholder", "Settlement state", "Claim flow"],
      },
      {
        id: "decisions",
        label: "Decisions",
        title: "Oracle decisions",
        body: "Planned UI for tracking decisions, outcomes, and dispute windows.",
        bullets: ["Decision list", "Outcome status", "Vote/dispute placeholders", "History"],
      },
    ],
  },
  {
    id: "coinshift",
    slot: 255,
    displayName: "CoinShift",
    shortName: "CoinShift",
    status: "active",
    tagline: "Cross-chain movement and atomic-swap style workflows.",
    primaryUseCase: "Exchange",
    description:
      "CoinShift is the exchange/movement platform. The wallet UI will focus on shift routes, quotes, settlement states, and cross-chain safety.",
    featureTabs: [
      {
        id: "routes",
        label: "Routes",
        title: "Route selection",
        body: "Planned UI for choosing where value moves and how it settles.",
        bullets: ["Source/destination", "Route quote", "Timing estimate", "Failure handling"],
      },
      {
        id: "orders",
        label: "Orders",
        title: "Shift orders",
        body: "Future UI for tracking in-progress swaps or shift orders.",
        bullets: ["Order status", "Deposit address", "Settlement tx", "Refund path"],
      },
      {
        id: "safety",
        label: "Safety",
        title: "Cross-chain safety",
        body: "Safety checks for timeouts, refunds, and chain-specific confirmations.",
        bullets: ["Timeout display", "Refund readiness", "Confirmations", "Risk notices"],
      },
    ],
  },
  {
    id: "riscy",
    slot: 3,
    displayName: "RISCy",
    shortName: "RISCy",
    status: "proposed",
    tagline: "Proposed VM and programmable-contract platform.",
    primaryUseCase: "Contracts",
    description:
      "RISCy is proposed/reserved. The wallet UI scaffold is here so the platform can be designed before activation.",
    featureTabs: [
      {
        id: "contracts",
        label: "Contracts",
        title: "Contract interactions",
        body: "Planned UI for future contract calls, permissions, and transaction review.",
        bullets: ["Contract address", "Method/action picker", "Parameter review", "Simulation placeholder"],
      },
      {
        id: "apps",
        label: "Apps",
        title: "App launcher",
        body: "Future UI area for curated RISCy applications.",
        bullets: ["App cards", "Permissions", "Recent activity", "Pinned apps"],
      },
      {
        id: "developer",
        label: "Developer",
        title: "Developer tools",
        body: "Planned UI for contract developers and advanced users.",
        bullets: ["ABI/schema placeholder", "Call data", "Dry-run output", "Debug logs"],
      },
    ],
  },
];

export function getPlatformById(id: string): PlatformScaffold | undefined {
  return PLATFORMS.find((p) => p.id === id);
}
