# AGENTS.md — sidecoin (monorepo)

Operating instructions for AI coding agents working in this repository.
Read this file before doing anything else here.

## What this repository is

`sidecoin` is a [pnpm](https://pnpm.io) workspace monorepo for the Sidecoin
product — a wallet + explorer + marketing stack for the eCash Bitcoin hard
fork with BIP-300/301 Drivechain support. It is the **canonical** home of the
sidechain registry, the wallet UIs, the explorer, and the typed API client.

The **API adapter** (the Cloudflare Worker that served `/v1`, `/graphql`,
`/mcp`) used to live at `packages/api` but has been **extracted** into its own
repository: [`sidecoin-api`](https://github.com/APECSdev/sidecoin-api). It is
no longer present in this monorepo. The typed client that talks to that Worker
(`@sidecoin/api-client`) stays here.

- **Remote:** `git@github.com:APECSdev/sidecoin.git`
- **Branch:** `master`
- **Root package:** `sidecoin` v26.6.8 (private)
- **Package manager:** pnpm `9.15.4` (via `packageManager` in root
  `package.json`); the machine's `pnpm` binary is v11.21.0 but honors the pin
  and emits a `pnpm.onlyBuiltDependencies` deprecation warning (harmless)
- **Node:** `>=22` (enforced via root `engines`)
- **Workspace glob:** `packages/*` (see `pnpm-workspace.yaml`)

## Workspace packages

| Path | Package name | Workspace deps | Role |
| --- | --- | --- | --- |
| `packages/shared` | `@sidecoin/shared` | — | Chain config, sidechain registry, HD derivation, signing, tx building, types. **Source of truth for derivation + sidechain slots.** |
| `packages/api-client` | `@sidecoin/api-client` | — | Frozen typed client for the Sidecoin adapter API (talks to the external `sidecoin-api` Worker). No deps. |
| `packages/wallet` | `@sidecoin/wallet` | `@sidecoin/shared`, `@sidecoin/api-client` | Browser-based Vue 3 wallet (Vite + Pinia + Tailwind + vitest). Hardware signing (Ledger, Trezor, OneKey). |
| `packages/web` | `@sidecoin/web` | `@sidecoin/shared` | Astro marketing + web wallet site. |
| `packages/explorer` | `@sidecoin/explorer` | `@sidecoin/shared` | Vue chain explorer. |
| `packages/desktop` | `@sidecoin/desktop` | `@sidecoin/shared` | Tauri + Rust + Vue desktop wallet. |
| `packages/mobile` | `@sidecoin/mobile` | `@sidecoin/shared` | React Native mobile wallet. |
| `packages/smarthub` | `@sidecoin/smarthub` | — | Vue "Smart Hub" secure portal challenge landing page. |
| `packages/src` | (no package.json) | — | Empty placeholder dir; ignore. |

## Commands (run from the repo root unless noted)

```
pnpm install                  # workspace install (use --frozen-lockfile in CI)
pnpm test                     # pnpm -r test            (runs every package's tests)
pnpm lint                     # pnpm -r lint
pnpm type-check               # pnpm -r type-check

# Per-package (examples):
pnpm --filter @sidecoin/wallet test
pnpm --filter @sidecoin/wallet type-check        # vue-tsc --noEmit
pnpm --filter @sidecoin/shared test              # 228 passed / 1 skipped
pnpm --filter @sidecoin/shared type-check        # tsc --noEmit
pnpm --filter @sidecoin/api-client test          # 12 passed

# Dev servers (root scripts):
pnpm dev:wallet     # Vite dev server for the browser wallet
pnpm dev:web        # Astro dev for the marketing site
pnpm dev:explorer   # Vite dev for the explorer
pnpm dev:smarthub   # Vite dev for the Smart Hub
pnpm dev:desktop    # Tauri dev
pnpm dev:mobile     # React Native start
```

Always re-run the relevant package's `test` + `type-check` after edits. Both
must be green before commit.

## Test baselines (current)

| Package | Tests |
| --- | --- |
| `@sidecoin/shared` | 238 passed, 1 skipped (12 files) |
| `@sidecoin/wallet` | 339 passed (26 files) |
| `@sidecoin/web` | 118 passed (3 files) |
| `@sidecoin/explorer` | 43 passed (7 files) |
| `@sidecoin/smarthub` | 5 passed (1 file) |
| `@sidecoin/api-client` | 12 passed (1 file) |

(Counts from `pnpm --filter <pkg> test`; verify before citing in a PR.)

## CI (`.github/workflows/`)

- **`guardian.yml`** — the main CI suite, runs on push + PR to `master`. Jobs:
  `guardian`, `wallet`, `mobile`, `web`, `explorer`, `smarthub`, `api`
  (the `api` job now covers **only** `@sidecoin/api-client`; the
  `@sidecoin/api` adapter steps were removed when that package was extracted),
  plus gated deploys: `deploy-web`, `deploy-wallet`, `deploy-explorer`,
  `deploy-smarthub`. There is **no** `deploy-api` job anymore — the Worker is
  built/deployed from the `sidecoin-api` repo.
- **`explorer-smoke.yml`** — scheduled (every 6h) + manual live API smoke
  check against the public explorer endpoints. Does NOT gate deploys.
- **`release.yml`** — triggered on `v*` tags; builds desktop binaries + deploys
  web properties. Depends on `guardian` passing.

## Key conventions

1. **`@sidecoin/shared` is the source of truth** for chain config
   (`src/chain/`), the sidechain registry (`src/sidechains/registry.ts`),
   HD derivation (`src/wallet/derivation.ts`), and shared types
   (`src/types/`). Its subpath exports are `.` , `./chain`, `./sidechains`,
   `./types` (see `packages/shared/package.json` `exports`). The browser
   wallet imports derivation helpers from the package root
   (`import { deriveReceiveAddress } from "@sidecoin/shared"`).
2. **Derivation is split into three schemes** in
   `packages/shared/src/wallet/derivation.ts`:
   - `deriveReceiveAddress(mnemonic, network, index=0)` — BIP-84 P2WPKH
     (`bc1q…`/`tb1q…`), path `m/84'/{coinType}'/0'/0/{index}`. Used for L1
     (signet today). Consumed by `ReceiveView.vue` and `DashboardView.vue`.
   - `deriveDrivechainAddress(mnemonic, index=1)` — SLIP-0010 ed25519 +
     blake3 XOF (20 bytes) + base58 (no checksum, no version byte), path
     `m/1'/0'/0'/{index}'` (all hardened). Slot-independent: identical for
     Thunder (slot 9) and BitAssets (slot 4). Index starts at 1 (index 0 is
     never issued on-chain). Consumed by `SidechainsView.vue`.
   - `deriveEvmAddress(mnemonic, index=0)` — standard EVM BIP-44, secp256k1
     + keccak-256 + EIP-55 checksum, path `m/44'/60'/0'/0/{index}` (coin
     type 60). Used for Snowside (Avalanche L1 EVM, slot 88). Index starts
     at 0 (standard EVM convention). Payouts go to the same address — there
     is no separate payout derivation. Consumed by `SidechainsView.vue`.
   `SidechainsView.vue` dispatches per-slot: `ADDRESS_DERIVATION_SLOTS =
   {9, 4, 88}` with `EVM_ADDRESS_SLOTS = {88}` routing to
   `deriveEvmAddress` and the rest to `deriveDrivechainAddress`. Each
   platform card shows its own distinct receive address.
3. **Sidechain slots are authoritative** in
   `packages/shared/src/sidechains/registry.ts`. Active: 2 (bitnames),
   4 (bitassets), 9 (thunder), 13 (truthcoin), 98 (zside), 99 (photon),
   255 (coinshift). Proposed: 3 (riscy), 88 (snowside — requested, not yet
   officially assigned). Coming soon: elementsplus (no slot).
   `LAUNCH_SIDECHAINS` has 10 entries. Slots are sparse — never assume
   `slot === array index`.
4. **The wallet keystore is signet-only and plaintext.**
   `packages/wallet/src/keystore.ts` stores the mnemonic in `localStorage`
   under `sidecoin.wallet.v1`. This is acceptable only for throwaway signet
   funds; encryption-at-rest must land before any mainnet support.
5. **`@sidecoin/api-client` talks to the external Worker.** Its
   `DEFAULT_BASE_URL` is `https://sidecoin.app/v1`. It never imports from
   `sidecoin-api`; it consumes the public HTTPS surface.
6. **No `packages/api` here anymore.** If a task references the API adapter's
   sources, routes, or migrations, that work happens in the `sidecoin-api`
   repo, not here. The only API-related code left here is
   `packages/api-client`.

## Committing

- Branch is `master`; the history is linear.
- Keep commits focused; match the existing conventional-commit prefixes
  (`feat(...)`, `fix(...)`, `refactor(...)`, `test(...)`).
- Never commit `node_modules/`, `.wrangler/`, `.dev.vars`, `dist/`, or
  secrets — the root `.gitignore` already excludes them.
- After adding/removing a workspace package or changing a dependency, run
  `pnpm install` to regenerate `pnpm-lock.yaml` and commit the lockfile in
  the same change.
