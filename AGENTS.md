# AGENTS.md — sidecoin (monorepo)

Read this before working here. `sidecoin` is the canonical pnpm workspace
monorepo for the Sidecoin product — a wallet + explorer + marketing stack for
the eCash Bitcoin hard fork with BIP-300/301 Drivechain support.

The **API adapter** (the Worker that served `/v1`, `/graphql`, `/mcp`) was
**extracted** to [`sidecoin-api`](https://github.com/APECSdev/sidecoin-api).
It is no longer here. Only the typed client `@sidecoin/api-client` remains.

- **Remote:** `git@github.com:APECSdev/sidecoin.git` (`origin`); GitLab mirror
  `git@gitlab.com:nyusternie/sidecoin.git` (`gitlab`, F-Droid staging)
- **Branch:** `master`, linear history. **Root package:** `sidecoin` v26.6.8
- **pnpm `9.15.4`** (pinned via root `packageManager`); **Node `>=22`**
- **Workspace globs:** `packages/*` and `apps/*`

## Layout: apps vs packages

The split is one line: **can another workspace project consume it as a
library?**

- **`packages/*`** — libraries, consumed via `workspace:*`, never deployed.
- **`apps/*`** — end-user products. Each has its own build/deploy step and
  platform target; none is imported by another workspace project.

`mobile` and `desktop` are apps, not packages: they ship as end artifacts (an
APK / a native binary), not libraries. Verified — nothing in the workspace
depends on `@sidecoin/mobile` or `@sidecoin/desktop`.

| Path | Package | Role |
| --- | --- | --- |
| `packages/shared` | `@sidecoin/shared` | Chain config, sidechain registry, HD derivation, signing, tx building, types. **Source of truth for derivation + sidechain slots.** |
| `packages/api-client` | `@sidecoin/api-client` | Frozen typed client for the adapter API (talks to the external `sidecoin-api` Worker). No deps. |
| `apps/wallet` | `@sidecoin/wallet` | Browser Vue 3 wallet (Vite + Pinia + Tailwind + vitest). Hardware signing (Ledger/Trezor/OneKey). |
| `apps/web` | `@sidecoin/web` | Astro marketing + web wallet site. |
| `apps/explorer` | `@sidecoin/explorer` | Vue chain explorer. |
| `apps/desktop` | `@sidecoin/desktop` | Tauri + Rust + Vue desktop wallet. |
| `apps/mobile` | `@sidecoin/mobile` | React Native wallet (Android/F-Droid first). Encrypted keystore. See below. |
| `apps/smarthub` | `@sidecoin/smarthub` | Vue "Smart Hub" portal challenge landing page. |

`packages/src/` is a stale generated `bindings.ts` placeholder; ignore it.

## React Native app (`apps/mobile`)

A port of `apps/wallet`, built in place — do **not** create a separate package.
Android/F-Droid first; iOS deferred.

Every route in `apps/wallet/src/router/index.ts` is wired. The one placeholder
is `hardware`, permanently: Ledger/Trezor/OneKey use WebUSB/WebHID, which has
no RN equivalent. `apps/mobile/src/screens/index.tsx` `SCREEN_SOURCES` is the
authoritative route → Vue-file map; keep it current.

Ported: shell + keystore (`App.tsx`, `navigation/RootNavigator.tsx`,
`keystore.ts`); logic (`api/index.ts`, `send.ts`, `entitlements.ts`,
`data/platforms.ts`, `hardware/network.ts`, `theme/`, `demo.ts`,
`polyfills.ts`); screens (onboarding, dashboard, send, receive, platforms,
platform-detail, swap, markets, toolbox, pro, settings); components
(`components/ui.tsx`, `components/pro/*`, `components/QrScanner.tsx`,
`components/paymenturi.ts`, `components/bitnames/*`).

**Local transaction history** lives in `apps/mobile/src/history.ts` — a small
SQLite store built on **`@op-engineering/op-sqlite`** (NOT
`react-native-sqlite-storage`, which was removed). op-sqlite compiles the
SQLite amalgamation (`cpp/sqlite3.c`) from source at build time and, in its
default configuration, packages **no** prebuilt native library: its
`android/build.gradle` sets `jniLibs.srcDirs = []` unless libsql / turso /
sqlite-vec are explicitly enabled via the app's `package.json`. That is why the
F-Droid recipe carries **no prebuilt-binary `scanignore` entry** for SQLite.
Amounts are stored as decimal satoshi **strings**, never INTEGERs — op-sqlite
returns INTEGER columns as JS numbers, which would corrupt values above 2^53.
`SendScreen` records every broadcast; `ReceiveScreen`'s History tab reads the
store back. Tests use the manual mock at
`apps/mobile/__mocks__/@op-engineering/op-sqlite.js` (an in-memory engine that
understands only the statements `history.ts` issues).

**Release APKs are ARM-only.** `android/gradle.properties` sets
`reactNativeArchitectures=arm64-v8a,armeabi-v7a`. Without that property the RN
Gradle plugin returns an empty architecture list, which means no `abiFilters`
at all and all four ABIs packaged — the x86/x86_64 images are emulator-only
and accounted for ~72 MB of a ~148 MB APK. F-Droid ships one universal APK per
version, so ABI splits are not an option; both ARM ABIs stay in one APK.

**Native libraries are compressed inside the APK.**
`android/app/build.gradle` sets `packaging { jniLibs { useLegacyPackaging = true } }`,
which deflates the 52 bundled `.so` files. AGP's default
(`extractNativeLibs="false"`) stores them uncompressed so the loader can mmap
them, which is better for install size and startup but makes the download much
larger. With the property set, the release APK is 35,187,266 bytes instead of
74,521,086. Use the DSL flag, not the `android:extractNativeLibs` manifest
attribute — AGP writes `extractNativeLibs=false` after the manifest merge and
can override a hand-written attribute. Requested by the F-Droid reviewer on
[MR 50457](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/50457).

### F-Droid submission (MR 50457)

**The recipe lives in two places and they are NOT identical.**
`apps/mobile/metadata/app.sidecoin.yml` is the maintenance copy and keeps an
explanatory comment header. The authoritative copy is
`metadata/app.sidecoin.yml` in
[fdroiddata](https://gitlab.com/fdroid/fdroiddata). CI enforces that
`fdroid rewritemeta` produces **zero diff**, and rewritemeta **strips every
comment** — so the fdroiddata copy is comment-free by definition. Edit the
source copy, then copy it over and run `fdroid rewritemeta`; do not hand-edit
the fdroiddata copy.

**Route (a): F-Droid publishes the upstream-signed binary, it does not rebuild
ours.** `Binaries:` points at
`https://github.com/APECSdev/sidecoin/releases/download/v%v/app-fdroid-release.apk`
and `AllowedAPKSigningKeys` pins our cert
(`42126930dd049c558fcebc7f5893fa83cba0021a24aafe447e4dc6b3452d65d4`). publish.py
downloads that APK and verifies it against the built one; a mismatch **skips**
publish rather than re-signing.

**Every release must therefore ship a GitHub release asset named EXACTLY
`app-fdroid-release.apk`.** `gh release create <file>#<label>` sets a *label*,
not the filename — use `gh release upload vX.Y.Z /path/to/app-fdroid-release.apk`.
A wrong asset name makes `%v` 404 and breaks the next update check.

**Current state:** 26.10.5 (`versionCode 20261005`, recipe commit
`2200761c72`, source commit `2eb9a668cf019b002195fc8b4c0f07264442652b`), MR
pipeline `2915044830` all green including the reproducible `check apk` step
(28.7 MB, 44 native libs — quick-crypto/nitro/OpenSSL removed). mezinster's
review was answered with note `3958314135`. `AutoUpdateMode: Version` +
`UpdateCheckMode: Tags` means the next release needs a new tag AND a new
`app-fdroid-release.apk` upload with that exact filename.

**Tab order is `dashboard` (Home) | `feed` | `explore` | `platforms`** —
Platforms is deliberately LAST. Send, Receive, Settings, Profile, and Scan QR
live behind the floating action button (`components/FabMenu.tsx`) and are stack
routes; `qr-scan` (`screens/QrScanScreen.tsx`) wraps the shared `QrScanner`.
All other non-tab routes are stack routes.

**The FAB is on EVERY screen except `qr-scan` and `onboarding`.**
`MainTabs` draws the tab-shell FAB (so it clears the measured tab bar);
`RootNavigator` draws a second one outside `Stack.Navigator` for every other
stack screen, gated by `FAB_HIDDEN_ROUTES`. Profile is also `headerAvatar`-
reachable from each stack header (`components/HeaderAvatar.tsx`).

**Feed is half-real, half-mock** (`screens/FeedScreen.tsx`): it mounts the same
`components/bitnames/CoinNewsPreview.tsx` the dashboard uses (live Coin News),
then a clearly-badged mock Nostr/DM stream. **Explore is a real, minimal
WebView** (`screens/ExploreScreen.tsx`): address bar + back/forward/reload, an
empty `<WebView>` at start, and verified-200 bookmarks. `MockScreens.test.tsx`
asserts the mock disclosure and the real WebView wiring.

**`NavigationContainer` must receive `theme={navigationTheme}`**
(`navigation/theme.ts`). Without it React Navigation applies its light
`DefaultTheme` (`background #f2f2f2`) and paints a white gutter around dark
screens. `App.test.tsx` guards this.

### Network model

- `WalletNetwork = "signet" | "betanet"` (`apps/mobile/src/keystore.ts`).
  **Default `betanet`.** Settings and Receive both offer Betanet + Signet.
- Betanet is a mainnet fork: `coinTypeFor` returns 0, `bech32.hrp` is `"bc"`,
  so one mnemonic yields the same addresses as mainnet.
- L1 reads use Esplora (`ESPLORA_BASES`, `apps/mobile/src/api/index.ts`):
  signet → `https://esplora.signet.drivechain.info`,
  betanet → `https://esplora.beta.ecash.ninja`.
- **Only signet has a faucet** (`https://node.signet.drivechain.info/`, web UI;
  bare `/api` 404s). Betanet has none.

### Build & deploy (Android)

```
cd apps/mobile
npx tsc --noEmit && npx jest      # 183 tests, 12 suites
cd android && ./gradlew assembleFdroidRelease
adb -s <serial> install -r app/build/outputs/apk/fdroid/release/app-fdroid-release.apk
```

- `applicationId app.sidecoin`, `versionCode 20261005`, `versionName 26.10.5`,
  minSdk 24, compileSdk/targetSdk 35, RN 0.81.1 / React 19.1.0, NDK
  `27.1.12297006`, Kotlin 2.0.21, Gradle 8.13. Release APK ~29 MB (26.10.5)
  after dropping quick-crypto/nitro/OpenSSL and NativeWind; earlier: 35 MB in
  26.10.1, ~148 MB before `reactNativeArchitectures` limited it to
  arm64-v8a + armeabi-v7a).
- Flavors `fdroid` / `playstore`. Sentry is `optionalDependencies`-scoped and
  `metro.config.js` resolves it to `src/lib/sentry-noop.ts` for every flavor
  EXCEPT `playstore`, so `fdroid` builds have no crash reporting (intentional,
  and required by the F-Droid inclusion policy). The flavor is read from
  `process.argv` because Gradle's per-variant
  `createBundle<Flavor><BuildType>JsAndAssets` task name is the only place RN
  exposes it; `metroFlavor.test.ts` pins it.
- Signing uses our own key (`android/keystore.properties` +
  `apecsdev-release.keystore`, both gitignored). Cert `CN=APECS Dev`, SHA-256
  `42126930dd049c558fcebc7f5893fa83cba0021a24aafe447e4dc6b3452d65d4`.
- `./gradlew` runs are long (cold: tens of minutes) — background and poll.

### Mobile gotchas (each cost real debugging time)

1. **Register every navigator route unconditionally.** React Navigation
   silently drops an action targeting an unregistered route. `RootNavigator`
   once registered the stack conditionally on a stored wallet, so
   `navigation.replace("main")` after a seed import did nothing.
   `initialRouteName` gates startup; registration must not. `App.test.tsx`
   asserts the registration set and fails on the old behavior.
2. **`react-native-vector-icons` needs `fonts.gradle` applied manually.**
   Autolinking wires the native module but NOT the typefaces — without
   `apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")`
   in `android/app/build.gradle` the APK has zero `.ttf` files and every icon
   is a missing-glyph box. Verify `unzip -l <apk> | grep ttf`.
3. **`.tsx` is required for any file containing JSX** — keep
   `screens/index.tsx`'s extension.
4. **`Button` has no `testID` prop.** Select buttons by text. `Card` has
   `testID`.
5. **Use `getAllByText(...).length` + `toBeGreaterThan(0)`** when a string can
   render more than once; `getByText` throws "Found multiple elements". For a
   label that also appears elsewhere, flatten the whole tree's text (a
   `treeText()` helper) and normalize whitespace, or add a `testID` to the
   Pressable and select by it.
6. **Mock native modules in `App.test.tsx`** —
   `@react-native-async-storage/async-storage`, `react-native-vision-camera`,
   `@react-native-clipboard/clipboard`, `react-native-qrcode-svg`,
   `react-native-safe-area-context`.
7. **Jest transforms ESM-only crypto deps**: `@noble`, `@scure`,
   `micro-key-producer`, `micro-packed` are allowlisted in `jest.config.ts`
   `transformIgnorePatterns`. `react-native-webview` is allowlisted too (it
   ships untranspiled ESM and Explore mounts it) and its native
   `RNCWebViewModule` must be `jest.mock`ed in any suite that pulls in the
   navigator.
8. **Mobile tests use Jest globals** — do NOT import `@jest/globals` (types
   unavailable in the mobile tsconfig).
9. **Any screen whose content can exceed the viewport must render in a
   `ScrollView`.** The shared `Screen` primitive scrolls by default; pass
   `scroll={false}` only when the screen manages its own list scrolling.
10. **`apps/mobile` has no ESLint config** (pre-existing). Its `lint` script
    fails; not caused by any port change. Open item.
11. **Stale Jest cache masks fixes** — if a module-resolution fix seems not to
    take, `rm -rf /tmp/jest_rs` first.
12. **`useBottomTabBarHeight()` throws outside a tab scene.** Its context
    wraps only the scenes, not siblings of the navigator. `FabMenu` floats
    beside `<Tab.Navigator>`, so `MainTabs` instead measures the bar ("`tabBar`"
    render prop + `onLayout`) and passes the height down as `bottomOffset`.
    Jest's `@react-navigation/bottom-tabs` mock must therefore export
    `BottomTabBar` and invoke the `tabBar` render prop.
13. **`react-native-webview` has NO consumer ProGuard rules and R8 is on.**
    `react-native-webview@13.16.0` ships no `consumer-rules.pro` and declares
    no `consumerProguardFiles`, while the release build sets
    `minifyEnabled true` + `shrinkResources true`. R8 can then strip/rename the
    module and the release APK crashes only when a `<WebView>` mounts. This is
    patched by an explicit keep in `android/app/proguard-rules.pro`:
    `-keep class com.reactnativecommunity.webview.** { *; }`. If a WebView
    screen ever crashes **in release only**, check that keep first.
14. **`onStateChange` belongs to `NavigationContainer`, not a navigator.**
    The root FAB lives *outside* `Stack.Navigator` and needs the focused
    route, so the container ref is shared through
    `src/navigation/ref.ts` (`createNavigationContainerRef`); `RootNavigator`
    subscribes via `navigationRef.addListener("state", …)`.

## Commands

Run from the repo root unless noted.

```
pnpm install / test / lint / type-check    # workspace-wide; --frozen-lockfile in CI
pnpm --filter @sidecoin/<pkg> test|type-check

# Android (from apps/mobile/android):
./gradlew assembleFdroidRelease            # release APK, our signing key

# Dev servers (root scripts):
# pnpm dev:wallet | dev:web | dev:explorer | dev:smarthub | dev:desktop | dev:mobile
```

Always re-run the affected package's `test` + `type-check` after edits; both
must be green before commit.

**Test baselines** (`pnpm --filter <pkg> test`; verify before citing in a PR):
shared 254 (+1 skip) · wallet 382 · web 118 · explorer 43 · desktop 76 ·
smarthub 5 · mobile 228 (16 suites) · api-client 12.

## CI (`.github/workflows/`)

- **`guardian.yml`** — main suite on push + PR to `master`. Jobs: `guardian`,
  `wallet`, `mobile`, `web`, `explorer`, `smarthub`, `api` (covers **only**
  `@sidecoin/api-client`), plus gated `deploy-web`, `deploy-wallet`,
  `deploy-explorer`, `deploy-smarthub`. The `mobile` job only runs
  `pnpm --filter @sidecoin/mobile test` — there is NO Android build/deploy job
  in CI; the APK is built and installed locally. No `deploy-api` job — the
  Worker deploys from the `sidecoin-api` repo.
- **`explorer-smoke.yml`** — scheduled (6h) + manual live API smoke check.
  Does NOT gate deploys.
- **`release.yml`** — on `v*` tags; builds desktop binaries + deploys web
  properties. Depends on `guardian` passing.

## Key conventions

1. **`@sidecoin/shared` is the source of truth** for chain config
   (`src/chain/`), the sidechain registry (`src/sidechains/registry.ts`), HD
   derivation (`src/wallet/derivation.ts`), and types (`src/types/`). Subpath
   exports: `.`, `./chain`, `./sidechains`, `./types`.
2. **Three derivation schemes** (`packages/shared/src/wallet/derivation.ts`):
   - `deriveReceiveAddress(mnemonic, network, index=0)` — BIP-84 P2WPKH,
     `m/84'/{coinType}'/0'/0/{index}`. L1. `coinTypeFor` → 0 for mainnet +
     betanet, 1 for all test networks.
   - `deriveDrivechainAddress(mnemonic, index=1)` — SLIP-0010 ed25519 + blake3
     XOF (20 bytes) + base58, `m/1'/0'/0'/{index}'` (all hardened),
     slot-independent, index from 1 (index 0 is never issued on-chain).
   - `deriveEvmAddress(mnemonic, index=0)` — EVM BIP-44, secp256k1 +
     keccak-256 + EIP-55, `m/44'/60'/0'/0/{index}`, index from 0.
   Per-slot dispatch: `ADDRESS_DERIVATION_SLOTS = {9, 4, 88}`,
   `EVM_ADDRESS_SLOTS = {88}` → `deriveEvmAddress`; rest →
   `deriveDrivechainAddress`. Each platform card shows its own address.
3. **Sidechain slots are authoritative** in
   `packages/shared/src/sidechains/registry.ts` — active 2, 3, 4, 9, 13, 88,
   98, 99, 130, 255; coming soon elementsplus (no slot). `LAUNCH_SIDECHAINS`
   has 11 entries; `getActiveSidechains()` returns 10. Slots are sparse —
   never assume `slot === array index`.
4. **Browser keystore is plaintext; mobile keystore is encrypted.**
   `apps/wallet/src/keystore.ts` stores the mnemonic in `localStorage` under
   `sidecoin.wallet.v1` — only acceptable for throwaway test funds;
   encryption-at-rest must land before mainnet support.
   `apps/mobile/src/keystore.ts` uses the platform keychain
   (`react-native-keychain`, service `app.sidecoin.wallet`) with a non-secret
   AsyncStorage envelope, via an async API. `StoredWallet.network` is
   `WalletNetwork` = `"signet" | "betanet"` (NOT the full `NetworkId` union).
   `setWalletNetwork()` persists and notifies subscribers (no DOM events in
   RN). `loadWallet()` validates and falls back to `"betanet"`.
5. **`NetworkId` has 6 members** (`packages/shared/src/types/network.ts`):
   `mainnet`, `testnet`, `signet`, `regtest`, `l2l-signet`, `betanet`. Betanet
   is the default (`DEFAULT_NETWORK_ID`, `chain/networks.ts`) and is not
   production. **`alphanet` was removed** when its chain stalled — do not
   re-add it.
6. **Fork activation is block ~973,728 on 2026-10-31 15:00 UTC**
   ([ecash.com](https://ecash.com)). It lives in every `ChainConfig.fork`
   (`packages/shared/src/chain/config.ts`) plus the countdown components in
   `apps/web`, `apps/wallet`, `apps/desktop`, and the Rust node log
   (`apps/desktop/src-tauri/src/lib.rs`). Regtest forks at block 0; betanet at
   967,680. On a date change, grep `2026-10-31` and `973_728` / `973,728` and
   update every hit.
7. **External sources for eCash/ECX facts** (check before changing consensus
   params, address formats, or fork values):
   - [ecash.com](https://ecash.com) — official site + live fork countdown
     (authoritative).
   - [ecash-com/fast-facts](https://github.com/ecash-com/fast-facts) —
     integration guide. Its README can lag ecash.com; cross-check the fork
     block/date live. Stable facts: network magic/ports, replay protection
     (`nLockTime = 499999999`), address/key format parity.
   - [drivechain.dev/config](https://drivechain.dev/config) — JSON network +
     sidechain registry (backends, explorers, services, ports, magic).
   - [drivechain.info/dev.txt](https://drivechain.info/dev.txt) — fast-info
     file.
   - [BIP-300](https://github.com/bitcoin/bips/blob/master/bip-0300.mediawiki),
     [BIP-301](https://github.com/bitcoin/bips/blob/master/bip-0301.mediawiki).
8. **`@sidecoin/api-client` talks to the external Worker** —
   `DEFAULT_BASE_URL` `https://sidecoin.app/v1`. It never imports from
   `sidecoin-api`; it consumes the public HTTPS surface. **No `packages/api`
   here anymore** — adapter sources, routes, and migrations live in the
   `sidecoin-api` repo.
9. **L1 reads + broadcast route to public Esplora, NOT sidecoin.app/v1.** The
   adapter is offline, so L1 balance / UTXO / broadcast / raw-tx go to the
   mempool-electrs endpoints from
   [drivechain.dev/config](https://drivechain.dev/config): signet →
   `https://esplora.signet.drivechain.info`, betanet →
   `https://esplora.beta.ecash.ninja`. These live in
   `apps/wallet/src/api/index.ts` (`ESPLORA_BASES` + `esplora*` helpers).
   `getL1Balance`, `getL1Utxos`, `broadcastTransaction`, `getRawTransaction`
   are network-aware and return the SAME `ChainBalance` / `UtxosResult` /
   `BroadcastReceipt` shapes views consume, so views only pass
   `wallet.network`. UTXO `scriptPubKey` is recovered from the address via
   `scriptPubKeyFromAddress` (Esplora `/utxo` omits it). `getSidechains` /
   `getDeposits` / `getWalletBalance` still hit the adapter client (L2, not
   L1) and fail until it returns.
10. **ECX market price comes from eCash Farm.** `getMarketPrice`
    (`apps/wallet/src/api/index.ts`) fetches
    `https://ecashfarm.com/v1/markets` and reads `projected.ecxUsd` (a
    forward-looking projection, not a last-trade print). Returns the SAME
    `MarketPrice` shape (`asset`, `name`, `price_usd`, `source`, `as_of`);
    `source` is `"eCash Farm"`, `as_of` the upstream `updatedAt` epoch
    seconds as ISO. Rendered as "ECX (Projected) Market Price" with a linked
    "eCash Farm ↗" badge.
11. **`satsToBtc` always shows at least 2 decimal places.**
    `apps/wallet/src/api/index.ts` strips trailing zeros from the 8-digit
    fraction but **pads to a minimum of 2** — `4` → `"4.00"`, `4.1` →
    `"4.10"`, `0` → `"0.00"`. Used by the Dashboard L1 balance card,
    SendView, HardwareWalletView, and CoinNews components.
12. **Fee policy: default L1 fee rate is 2, displayed as `szats`.**
    `FEE_RATE_SAT_PER_VB = 2` in both wallets; UI reads `szats/vB` (`szat`
    singular) and the badge reads `Flat fee`. **Rename only user-visible
    display strings** — do NOT rename variable identifiers (`satsToBtc`,
    `SATS_PER_COIN`, `FEE_RATE_SAT_PER_VB`, `formatSats`, `balanceSats`),
    wire fields (`fee_sats`, `valueSats`, `totalSats`), or shared
    Bitcoin-standard identifiers (`amountSatoshis`, `feeSatoshis`,
    `feeRateSatPerVb`).
13. **Branding is plain text: no styled wordmark.** The Greek Xi (Ξ)
    was removed from all user-facing text (commit `fbf30a3`) — the name is
    written **"Sidecoin"** everywhere. Do not re-introduce Ξ styling in
    UI strings, aria labels, or tests. Legacy: binary assets (launcher
    icons, og/hero images, dashboard screenshot) still carry the Xi glyph
    and need regeneration. Two non-brand glyphs kept: `PaymentFlow.vue`
    currency map uses `eth: "ETH"` (text, not the Ξ ETH glyph), and
    other coin glyphs (₿, Ł, …) are untouched.
14. **`Alert` only colors plain-string children.** Pass error text as a
    string child (or give element children an explicit color) — a styled
    `<Text>` child renders black on the dark-red error background and is
    unreadable. See `SendScreen`/`ReceiveScreen`.
15. **QR scanner permission is requested in the native activity.**
    `ZxingQrScannerActivity` registers a
    `RequestPermission` launcher and asks for CAMERA before building its
    UI; without it the activity silently finished and every scan returned
    null. The FAB "Scan" action opens Send with `autoScan: true` — there
    is no standalone `qr-scan` route.
16. **`react-native-quick-crypto` and `react-native-nitro-modules` were
    REMOVED (10/2026).** Inherited from the original mobile scaffold and
    never imported by app code. Credit **`@noble`/`@scure`** for making
    quick-crypto unnecessary: their pure-JS primitives are written for
    constrained runtimes (Hermes included) and are fast enough that native
    OpenSSL acceleration is not needed — secp256k1 sign 660 ms on-device,
    measured. Removing the pair also eliminates the prebuilt OpenSSL F-Droid
    review flagged
    (quick-crypto's `android/build.gradle` pulled
    `io.github.ronickg:openssl:3.6.0-1`, adding `libcrypto.so`/`libssl.so`).
    The `crypto:` entry in `metro.config.js` `extraNodeModules` was the only
    remaining reference and went with them; `packages/shared`'s unused
    `bip39` 3.1.0 (Node-crypto-dependent) was dropped too. Device-verified:
    one send before and one after removal with identical timing.

## Versioning (apps/mobile)

**The Android version is DATE-BASED and `versionCode` is EIGHT digits
(`YYYYMMDD`).** This is a hard rule — not a suggestion.

- `versionCode = 20261005` for 2026-10-05 (the release date), NOT `261005`
  and NOT an arbitrary build counter.
- `versionName = "26.10.5"` — the short `YY.M.D` form of the SAME date.
- Change **all three together**:
  1. `apps/mobile/android/app/build.gradle` (`versionCode` + `versionName`)
  2. `apps/mobile/package.json` (`"version"`)
  3. `apps/mobile/android/app/src/fdroid/play/release-notes/en-US/default.txt`
     — the store changelog. F-Droid reads release notes from the Triple-T
     layout (`src/<flavor>/play/` in the app module), NOT from
     `fastlane/metadata/android/<locale>/changelogs/<versionCode>.txt`.
- Derive the date from the **release date**, not the commit date.

**Store metadata lives in the Triple-T layout, not fastlane.** F-Droid's
`update.py` `copy_triple_t_store_metadata()` scans
`build/<pkg>/<subdir>/<module>/src/<flavor>/play/` for listings
(`listings/<locale>/title.txt`, `short-description.txt`, `full-description.txt`),
graphics (`listings/<locale>/graphics/{icon,phone-screenshots}/`), and release
notes (`release-notes/<locale>/default.txt`). With `subdir: apps/mobile/android/app`
and flavor `fdroid`, that resolves to
`apps/mobile/android/app/src/fdroid/play/`. The reviewer on
[MR 50457](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/50457) asked for
this format explicitly, in place of `metadata/app.sidecoin/en-US/`.

> **Monotonic-install caveat.** F-Droid and Play require a strictly
> increasing `versionCode` per published release. A date is monotonically
> increasing across day, month, and year boundaries, so `YYYYMMDD` holds —
> provided each release carries the date it ships on. The one way to break it
> is **shipping twice in one day**: both builds would carry the same code and
> the store would reject the second. Escape hatches, in order of preference:
> bump to the next day, or append a same-day counter (`2026092301`, …). The
> field is an int32 (`2147483647` max), so even a 10-digit value fits.
>
> This applies to *published* versions. Earlier in-tree values (`26050011`,
> `26050030`) were never tagged or distributed, so `20260923` was the first
> published code. `20261001` is the next release. If a code is ever *decreased*
> against an actually-installed build, the APK cannot install as an update —
> the device must uninstall first and `adb install -r` fails.

## Committing

- `master`, linear. Keep commits focused; match existing prefixes
  (`feat(...)`, `fix(...)`, `refactor(...)`, `test(...)`).
- Never commit `node_modules/`, `.wrangler/`, `.dev.vars`, `dist/`, or
  secrets — root `.gitignore` excludes them.
- After adding/removing a package or changing a dependency, run `pnpm install`
  and commit `pnpm-lock.yaml` in the same change.
