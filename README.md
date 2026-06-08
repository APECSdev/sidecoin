# Sidecoin

[![codecov](https://codecov.io/gh/APECSdev/sidecoin/branch/master/graph/badge.svg)](https://codecov.io/gh/APECSdev/sidecoin)
[![Guardian](https://github.com/APECSdev/sidecoin/actions/workflows/guardian.yml/badge.svg?branch=master)](https://github.com/APECSdev/sidecoin/actions/workflows/guardian.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9.15.4-f69220.svg)](https://pnpm.io)

### https://sidecoin.app

Web, Mobile, and Desktop wallets supporting eCash and its community of drivechains.

> Drivechain web wallet, plus multi-platform Mobile and Desktop apps supporting
> eCash – an ecosystem of Bitcoin-secured sidechain networks.

---

## What is Sidecoin?

Sidecoin is a multi-platform wallet built for the upcoming **eCash hard fork**
(block ~964,000, **August 21 2026, 15:00 UTC**). It supports **BIP-300**
Hashrate Escrows and **BIP-301** Blind Merged Mining — enabling trustless
sidechains secured by Bitcoin's full SHA-256d hashrate.

## Platforms

| Platform | Stack | Highlights |
|----------|-------|------------|
| 🖥️ **Desktop** | Tauri + Rust | Full node connectivity, hardware wallet support, BIP-300 deposit/withdrawal management |
| 📱 **Mobile** | React Native (Android via F-Droid, iOS) | QR scanning, biometric auth, lightweight SPV mode |
| 🌐 **Web** | Astro + Vue (coming soon) | No install — connect to your node and manage sidechains from any device |

## Sidechains at Launch

Each sidechain occupies a BIP-300 slot and is secured by Bitcoin's full
hashrate via Blind Merged Mining (BIP-301).

| Slot | Sidechain | Status | Description |
|------|-----------|--------|-------------|
| 0 | **Thunder Network** | Active | Lightning-compatible payment channel network for instant, low-fee payments |
| 1 | **zSide** | Active | Privacy sidechain with Zcash-style zero-knowledge shielded transactions |
| 2 | **BitNames** | Active | Decentralized naming and identity — human-readable names anchored to mainchain |
| 3 | **BitAssets** | Active | Tokenized assets and prediction markets secured by Bitcoin hashrate |
| 4 | **Photon** | Active | EVM-compatible smart contract sidechain (Solidity via merged mining) |
| 5 | **Truthcoin** | Active | Paul Sztorc's peer-to-peer prediction market and oracle system |
| 6 | **CoinShift** | Active | Cross-chain atomic swap sidechain for trustless exchange |
| 7 | **TBA** | Proposed | Reserved slot — details announced before the August 2026 fork |

## Chain Parameters

| Parameter | Value |
|-----------|-------|
| Proof of Work | SHA-256d |
| Block Time | 600s (10 min) |
| Block Weight | 4,000,000 WU |
| Subsidy at Fork | 3.125 eCash |
| Halving | every 210,000 blocks |
| Coinbase Maturity | 100 blocks |

## Fork Activation

|  |  |
|---|---|
| Block Height | ~964,000 |
| Timestamp | 2026-08-21 15:00 UTC |
| BIP-300 | Active |
| BIP-301 | Active |
| Sidechains | 8 at launch |
| Withdrawal Window | 26,300 blocks (~6 months) |

## Repository Structure

This is a [pnpm](https://pnpm.io) workspace monorepo.

```
packages/
  api/ Cloudflare Workers backend (GraphQL)
  api-client/   Typed API client shared by frontends
  desktop/      Tauri + Rust + Vue desktop wallet
  mobile/       React Native mobile wallet
  shared/       Chain config, sidechain logic, shared utils
  wallet/       Browser-based Vue wallet
  web/ Astro marketing + web wallet site
```

## Getting Started

```
# Requires Node >= 22 and pnpm 9.15.4
pnpm install

# Run a specific app
pnpm dev:web
pnpm dev:mobile
pnpm dev:desktop
pnpm dev:wallet

# Workspace-wide
pnpm test
pnpm lint
pnpm type-check
```

## Testing

```bash
pnpm -r test                            # all packages
pnpm --filter @sidecoin/shared test
pnpm --filter @sidecoin/wallet test
```

In CI, install with a frozen lockfile to guarantee the exact pinned
dependency tree:

```bash
pnpm install --frozen-lockfile
```

## Contributing

Built with TypeScript, Astro, Vue, Rust, and Kotlin. Issues and pull requests
welcome at [github.com/APECSdev/sidecoin](https://github.com/APECSdev/sidecoin).

## License

[MIT](./LICENSE) © APECSdev
