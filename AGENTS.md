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

- **Remotes:** `origin` = `git@github.com:APECSdev/sidecoin.git` (PRIMARY —
  GitHub), `gitlab` = `git@gitlab.com:nyusternie/sidecoin.git` (F-Droid
  staging + publication only). Push to BOTH when the operator asks.
- **Branch:** `master` (linear history)
- **Root package:** `sidecoin` v26.6.8 (private)
- **Package manager:** pnpm `9.15.4` (via `packageManager` in root
  `package.json`); the machine's `pnpm` binary is v11.21.0 but honors the pin
  and emits a `pnpm.onlyBuiltDependencies` deprecation warning (harmless)
- **Node:** `>=22` (enforced via root `engines`)
- **Workspace glob:** `packages/*` + `apps/*` (see `pnpm-workspace.yaml`)

## Layout: apps vs packages

The workspace is split into two trees:

- **`apps/*`** — deployable end-user products. Each one has a build (or
  bundle) step and is deployed by a `deploy-*` job in CI.
- **`packages/*`** — shared libraries. These are consumed via `workspace:*`
  and are never deployed on their own.

```
apps/
  mobile/     @sidecoin/mobile     React Native wallet (Android; iOS deferred)
  desktop/    @sidecoin/desktop    Tauri + Rust + Vue desktop wallet
  wallet/     @sidecoin/wallet     Browser-based Vue 3 wallet
  explorer/   @sidecoin/explorer   Vue chain explorer
  web/        @sidecoin/web        Astro marketing + web wallet site
  smarthub/   @sidecoin/smarthub   Vue "Smart Hub" landing page
packages/
  shared/     @sidecoin/shared     Chain config, registry, derivation, signing, tx, types
  api-client/ @sidecoin/api-client Frozen typed client for the Sidecoin adapter API
```

## Workspace packages

| Path | Package name | Workspace deps | Role |
| --- | --- | --- | --- |
| `packages/shared` | `@sidecoin/shared` | — | Chain config, sidechain registry, HD derivation, signing, tx building, types. **Source of truth for derivation + sidechain slots.** |
| `packages/api-client` | `@sidecoin/api-client` | — | Frozen typed client for the Sidecoin adapter API (talks to the external `sidecoin-api` Worker). No deps. |
| `apps/wallet` | `@sidecoin/wallet` | `@sidecoin/shared`, `@sidecoin/api-client` | Browser-based Vue 3 wallet (Vite + Pinia + Tailwind + vitest). Hardware signing (Ledger, Trezor, OneKey). |
| `apps/web` | `@sidecoin/web` | `@sidecoin/shared` | Astro marketing + web wallet site. |
| `apps/explorer` | `@sidecoin/explorer` | `@sidecoin/shared` | Vue chain explorer. |
| `apps/desktop` | `@sidecoin/desktop` | `@sidecoin/shared` | Tauri + Rust + Vue desktop wallet. |
| `apps/mobile` | `@sidecoin/mobile` | `@sidecoin/shared`, `@sidecoin/api-client` | React Native wallet (Android/F-Droid first; iOS deferred). Encrypted keychain keystore. See the dedicated section below. |
| `apps/smarthub` | `@sidecoin/smarthub` | — | Vue "Smart Hub" secure portal challenge landing page. |
| `packages/src` | (no package.json) | — | Stale generated `bindings.ts` placeholder; ignore. |

## React Native mobile app (`apps/mobile`)

The RN wallet is a port of the Vue browser wallet (`apps/wallet`). It builds
in place — do **not** create a separate package for it. Android/F-Droid is the
current priority; iOS is deferred.

### What is ported (as of `d38ee85`)

Every route in `apps/wallet/src/router/index.ts` is wired, except the two
placeholders below. `apps/mobile/src/screens/index.tsx` `SCREEN_SOURCES` is the
authoritative route → Vue-file map; keep it current as screens land.

| Ported | Module |
| --- | --- |
| Shell + keystore | `App.tsx`, `navigation/RootNavigator.tsx`, `keystore.ts` |
| Logic layer | `api/index.ts`, `send.ts`, `entitlements.ts`, `data/platforms.ts`, `hardware/network.ts`, `theme/`, `demo.ts`, `polyfills.ts` |
| Screens | onboarding, dashboard, send, receive, platforms (Sidechains), swap, markets, toolbox, pro, settings |
| Components | `components/ui.tsx`, `components/pro/*`, `components/QrScanner.tsx`, `components/paymenturi.ts`, `components/bitnames/*` |
| **Still placeholders** | `platform-detail`, `hardware` |

`hardware` is a permanent placeholder — Ledger/Trezor/OneKey use WebUSB/WebHID
in the browser build, which is not portable to React Native.

### Network model (differs from the Vue wallet)

- `WalletNetwork = "signet" | "betanet"` in
  `apps/mobile/src/keystore.ts`. **Default is `betanet`.**
- Settings offers both (Betanet / Signet, in that order).
- Receive offers Betanet + Signet only, matching the Vue view.
- L1 reads go to Esplora; the `ESPLORA_BASES` map in `apps/mobile/src/api/index.ts`
  covers both: signet → `https://esplora.signet.drivechain.info`,
  betanet → `https://esplora.beta.ecash.ninja`.
- **Only signet publishes a faucet** (`https://node.signet.drivechain.info/api`,
  3 coins / 3600 s — from [drivechain.dev/config](https://drivechain.dev/config)).
  Betanet has NO faucet, so funding a test wallet there requires
  an external source.

### Build & deploy (Android)

```
cd apps/mobile
npx tsc --noEmit                 # type-check
npx jest                         # 143 tests, 8 suites
cd android && ./gradlew assembleFdroidRelease
adb -s <serial> install -r app/build/outputs/apk/fdroid/release/app-fdroid-release.apk
```

- `applicationId app.sidecoin`, `versionCode 26050030`, `versionName 26.5.30`,
  minSdk 24, compileSdk/targetSdk 35. Release APK is ~148 MB (large — ABI
  splits / dependency trimming is an open item, not yet investigated).
- Flavors `fdroid` / `playstore`. Sentry is `optionalDependencies`-scoped and
  therefore absent from `fdroid` builds (crash reporting intentionally lost).
- Signing uses our own key (`android/keystore.properties` +
  `apecsdev-release.keystore`, both gitignored). Cert:
  `CN=APECS Dev`, SHA-256 `42126930dd049c558fcebc7f5893fa83cba0021a24aafe447e4dc6b3452d65d4`.
- `./gradlew` runs are long (~1.5 h cold, minutes warm) — background them and
  poll the log rather than blocking.

### Mobile gotchas (each cost real debugging time)

1. **Register every navigator route unconditionally.** React Navigation
   silently drops a navigation action that targets an unregistered route. An
   earlier `RootNavigator` registered the stack conditionally on whether a
   wallet was stored, so `navigation.replace("main")` after importing a seed
   did nothing at all. `initialRouteName` gates startup; registration must
   not. `App.test.tsx` now asserts the registration set and fails on the old
   behavior.
2. **`react-native-vector-icons` needs `fonts.gradle` applied manually.**
   Autolinking wires the native module but NOT the typefaces — without
   `apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")`
   in `android/app/build.gradle`, the APK contains zero `.ttf` files and every
   icon renders as a missing-glyph box. Verify with `unzip -l <apk> | grep ttf`.
3. **`.tsx` is required for any file containing JSX** — `screens/index.tsx`
   must keep the `.tsx` extension.
4. **The `Button` component has no `testID` prop.** Select buttons by their
   text in tests. `Card` does support `testID`.
5. **Use `getAllByText(...).length` + `toBeGreaterThan(0)`** when a string can
   render in more than one mounted screen (e.g. "Drivechains Financial Hub");
   `getByText` throws "Found multiple elements".
6. **Ambiguous/native modules must be mocked in `App.test.tsx`** —
   `@react-native-async-storage/async-storage`, `react-native-vision-camera`,
   `@react-native-clipboard/clipboard`, `react-native-qrcode-svg`.
7. **Jest transforms ESM-only crypto deps**: `@noble`, `@scure`,
   `micro-key-producer`, `micro-packed` are allowlisted in
   `jest.config.ts` `transformIgnorePatterns`.
8. **Mobile tests use Jest globals** — do NOT import from `@jest/globals`
   (its types are unavailable in the mobile tsconfig).
9. **`apps/mobile` has no ESLint config** (pre-existing gap). Its
   `lint` script (`eslint .`) therefore fails; this is not caused by any port
   change. Adding a config is an open item.
10. **Stale Jest cache masks fixes** — if a module-resolution fix appears not
    to take, `rm -rf /tmp/jest_rs` and re-run before debugging further.

## Commands (run from the repo root unless noted)

```
pnpm install                  # workspace install (use --frozen-lockfile in CI)
pnpm test                     # pnpm -r test            (runs every package's tests)
pnpm lint                     # pnpm -r lint
pnpm type-check               # pnpm -r type-check

# Per-package (examples):
pnpm --filter @sidecoin/wallet test
pnpm --filter @sidecoin/wallet type-check        # vue-tsc --noEmit
pnpm --filter @sidecoin/shared test              # 262 passed / 1 skipped
pnpm --filter @sidecoin/shared type-check        # tsc --noEmit
pnpm --filter @sidecoin/api-client test          # 12 passed
pnpm --filter @sidecoin/mobile test              # 143 passed (8 suites, jest)
pnpm --filter @sidecoin/mobile type-check        # tsc --noEmit

# Android (from apps/mobile/android — see the React Native section above):
./gradlew assembleFdroidRelease                   # release APK, our signing key

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
| `@sidecoin/shared` | 262 passed, 1 skipped (12 files) |
| `@sidecoin/wallet` | 382 passed (26 files) |
| `@sidecoin/web` | 118 passed (3 files) |
| `@sidecoin/explorer` | 43 passed (7 files) |
| `@sidecoin/desktop` | 76 passed (6 files) |
| `@sidecoin/smarthub` | 5 passed (1 file) |
| `@sidecoin/mobile` | 143 passed (8 suites) |
| `@sidecoin/api-client` | 12 passed (1 file) |

(Counts from `pnpm --filter <pkg> test`; verify before citing in a PR.)

## CI (`.github/workflows/`)

- **`guardian.yml`** — the main CI suite, runs on push + PR to `master`. Jobs:
  `guardian`, `wallet`, `mobile`, `web`, `explorer`, `smarthub`, `api`
  (the `api` job now covers **only** `@sidecoin/api-client`; the
  `@sidecoin/api` adapter steps were removed when that package was extracted),
  plus gated deploys: `deploy-web`, `deploy-wallet`, `deploy-explorer`,
  `deploy-smarthub`. The `mobile` job runs `pnpm --filter @sidecoin/mobile test`
  only — there is NO Android build or deploy job in CI; the APK is built and
  installed locally. There is **no** `deploy-api` job anymore — the Worker is
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
     (signet today). `coinTypeFor` returns 0 for mainnet + betanet (a
     mainnet fork — shared UTXO set, same addresses) and 1 for all test
     networks. Consumed by `ReceiveView.vue` and `DashboardView.vue`.
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
   3 (riscy), 4 (bitassets), 9 (thunder), 13 (truthcoin), 88 (snowside —
   requested, not yet officially assigned), 98 (zside), 99 (photon),
   130 (freebank), 255 (coinshift). Coming soon: elementsplus (no slot).
   `LAUNCH_SIDECHAINS` has 11 entries; `getActiveSidechains()` returns 10.
   Slots are sparse — never assume `slot === array index`.
4. **The wallet keystore is non-production-only and plaintext; the mobile
   keystore is encrypted.**
   `apps/wallet/src/keystore.ts` stores the mnemonic in `localStorage`
   under `sidecoin.wallet.v1`. This is acceptable only for throwaway test
   funds; encryption-at-rest must land before any mainnet support.
   `StoredWallet.network` is typed as `WalletNetwork` = `"signet"
   | "betanet"` (NOT the full `NetworkId` union). The active network is
   toggled in Settings (and on the Receive page) via `setWalletNetwork()`,
   which persists to the keystore and dispatches `WALLET_NETWORK_EVENT` so
   the Dashboard, Receive, and Sidebar re-derive/re-fetch live.
   `loadWallet()` validates the persisted network against the `WalletNetwork`
   allowlist and falls back to `"betanet"` (forward-compat with pre-toggle
   wallets).
   `apps/mobile/src/keystore.ts` instead keeps the mnemonic in the platform
   keychain (`react-native-keychain`, service `app.sidecoin.wallet`) with
   only a non-secret envelope in AsyncStorage, and exposes an async API.
5. **`NetworkId` has 6 members** (`packages/shared/src/types/network.ts`):
   `mainnet`, `testnet`, `signet`, `regtest`, `l2l-signet`,
   `betanet`.
   - `betanet` is the ECX beta practice network — a mainnet fork
     with a PoW difficulty reset to 1e9 (magic `eca5b104`, fork height
     967,680, activated 2026-09-19). It is the **default** network.
   Betanet is a mainnet fork: `coinTypeFor` returns 0 and `bech32.hrp` is
   `"bc"`, so the same mnemonic produces the same addresses as mainnet.
   It is not production (`isProduction: false`).
   The Receive page (`ReceiveView.vue`) exposes a session-only
   Betanet/Signet selector that re-derives the L1 address on switch — it
   is NOT persisted to the keystore. `DEFAULT_NETWORK_ID` is `"betanet"`.
6. **Fork activation is block ~973,728 on 2026-10-31 15:00 UTC** (pushed back
   from the earlier Aug 21 / block ~964,000 target). Authoritative source:
   [ecash.com](https://ecash.com) (live page title + bundled JS
   `2026-10-31T15:00:00Z`). This value lives in every `ChainConfig.fork`
   (`packages/shared/src/chain/config.ts`) plus the countdown components in
   `apps/web`, `apps/wallet`, `apps/desktop`, and the Rust node
   log in `apps/desktop/src-tauri/src/lib.rs`. Regtest is the exception
   (fork at block 0).
   When the fork date changes again, grep for `2026-10-31` and `973_728` /
   `973,728` and update every hit.
7. **Primary external sources for eCash/ECX facts** (consult before changing
   consensus params, address formats, or fork values):
   - [ecash.com](https://ecash.com) — official site, FAQ, live fork
     countdown (authoritative for the current fork block + date).
   - [github.com/ecash-com/fast-facts](https://github.com/ecash-com/fast-facts)
     — integration guide + per-topic docs (node setup, keys/addresses,
     replay protection, sidechains, mining, dry-runs). NOTE: its README can
     lag behind ecash.com; always cross-check the fork block/date against
     the live site. Useful for stable facts: network magic/ports, replay
     protection (`nLockTime = 499999999`), node software (Bitcoin Core v31.1
     fork at `github.com/ecash-com/bitcoin`), address/key format parity with
     Bitcoin.
   - [drivechain.dev/config](https://drivechain.dev/config) — JSON network
     + sidechain registry (backends, explorers, services, ports, magic).
     Source for `betanet`.
   - [drivechain.info/dev.txt](https://drivechain.info/dev.txt) — canonical
     fast-info file, updated frequently.
   - [BIP-300](https://github.com/bitcoin/bips/blob/master/bip-0300.mediawiki),
     [BIP-301](https://github.com/bitcoin/bips/blob/master/bip-0301.mediawiki)
     — drivechain + BMM specs.
8. **`@sidecoin/api-client` talks to the external Worker.** Its
   `DEFAULT_BASE_URL` is `https://sidecoin.app/v1`. It never imports from
   `sidecoin-api`; it consumes the public HTTPS surface.
9. **No `packages/api` here anymore.** If a task references the API adapter's
   sources, routes, or migrations, that work happens in the `sidecoin-api`
   repo, not here. The only API-related code left here is
   `packages/api-client`.
10. **L1 reads + broadcast route to public Esplora, NOT sidecoin.app/v1.**
   The `sidecoin.app/v1` adapter is offline (see `docs/HANDOFF.md`). Until it's
   restored, all L1 balance / UTXO / broadcast / raw-tx reads in the wallet go
   to the public Esplora (mempool-electrs) endpoints published at
   [drivechain.dev/config](https://drivechain.dev/config):
   - signet → `https://esplora.signet.drivechain.info`
   - betanet → `https://esplora.beta.ecash.ninja`
   These live in `apps/wallet/src/api/index.ts` (`ESPLORA_BASES` + the
   `esplora*` helpers). `getL1Balance`, `getL1Utxos`, `broadcastTransaction`,
   and `getRawTransaction` are network-aware (third arg `network: L1Network =
   "signet"`) and return the SAME `ChainBalance` / `UtxosResult` /
   `BroadcastReceipt` shapes the views already consume, so views only need to
   pass `wallet.network`. UTXO `scriptPubKey` is recovered from the address
   via `scriptPubKeyFromAddress` (`@sidecoin/shared/wallet/derivation`) since
   Esplora `/utxo` doesn't return it. `getSidechains` / `getDeposits` /
   `getWalletBalance` still hit the adapter client (they're sidechain/L2, not
   L1) and will fail until the adapter returns.
11. **ECX market price comes from eCash Farm, not SupaQt.** `getMarketPrice`
   (`apps/wallet/src/api/index.ts`) fetches `https://ecashfarm.com/v1/markets`
   and reads `projected.ecxUsd` (a forward-looking fair-value projection, not
   a last-trade print). It returns the SAME `MarketPrice` shape (`asset`,
   `name`, `price_usd`, `source`, `as_of`) so the Dashboard consumes it
   unchanged; `source` is `"eCash Farm"` and `as_of` is the upstream
   `updatedAt` epoch seconds as an ISO string. The Dashboard renders it as
   "ECX (Projected) Market Price" with a linked "eCash Farm ↗" badge
   (→ ecashfarm.com) and a local-time-formatted timestamp (no `asset` suffix
   on the price line). The `ECASHFARM_BASE_URL` constant lives next to
   `SUPAQT_BASE_URL`.
12. **`satsToBtc` always shows at least 2 decimal places.**
   `apps/wallet/src/api/index.ts` `satsToBtc(sats: bigint): string`
   formats satoshis as a decimal coin string. It strips trailing zeros from
   the 8-digit fraction but **pads to a minimum of 2 decimal places** — so
   `4` renders as `"4.00"`, `4.1` as `"4.10"`, `0` as `"0.00"`. Values with
   more precision (e.g. `1.337`) are unchanged. Used by the Dashboard L1
   balance card, SendView, HardwareWalletView, and CoinNews components.

## Committing

- Branch is `master`; the history is linear.
- Keep commits focused; match the existing conventional-commit prefixes
  (`feat(...)`, `fix(...)`, `refactor(...)`, `test(...)`).
- Never commit `node_modules/`, `.wrangler/`, `.dev.vars`, `dist/`, or
  secrets — the root `.gitignore` already excludes them.
- After adding/removing a workspace package or changing a dependency, run
  `pnpm install` to regenerate `pnpm-lock.yaml` and commit the lockfile in
  the same change.
