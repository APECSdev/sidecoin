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
`52b1d37559`, source commit `2eb9a668cf019b002195fc8b4c0f07264442652b`), MR
pipeline `2915044830` all green including the reproducible `check apk` step
(28.7 MB, 44 native libs — quick-crypto/nitro/OpenSSL removed). mezinster's
review was answered with note `3958314135`; their follow-up (note
`3983603322`) asked for the stale 26.10.1 `Builds` block to be dropped —
done in `52b1d37559`, the recipe now carries a single entry (the Skia `.a`
scanignore question is deferred to the maintainers). `AutoUpdateMode: Version` +
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

**Styling: NativeWind (Tailwind className) is wired as of 26.10.12** —
nativewind 4.2.7 + react-native-css-interop 0.2.7 + tailwindcss 3.4.17
(same Tailwind major as wallet/explorer; prettier-plugin-tailwindcss is
deliberately absent: the repo has no prettier config, and 0.5.x peers
prettier 3 while mobile pins 2.8.8). The chain is `global.css` (imported
in `index.js`) → `withNativeWind` (`metro.config.js`) → `nativewind/babel`
preset (excluded under Jest — it injects `_ReactNativeCSSInterop` references
that break `jest.mock()` hoisting; `nativewindBabel.test.ts` runs the
transform directly to keep the preset covered). Palette single source of
truth stays `src/theme/colors.ts`; `tailwind.config.js` MIRRORS it and
`tailwindParity.test.ts` fails on drift. Adoption is incremental —
className and `style` coexist (`style` wins); `Eyebrow` in
`components/ui.tsx` is the pilot conversion. Do NOT rewrite screens
big-bang. css-interop 0.2.7 also resolves the trigger that motivated the
original removal: it registers `react-native-safe-area-context`'s
SafeAreaView (`dist/runtime/components.js:49`), NOT RN core's deprecated
export, so the dev-only SafeAreaView deprecation badge does not return
(0.2.1 registered core's; the `2eb9a668` message records that trigger).

**Entitlements engine is live client-side as of 26.10.23**
(`src/entitlements.ts`). `CURRENT_ENTITLEMENTS` is now the mutable snapshot:
`refreshEntitlements()` queries `GET /v1/me/entitlements` (Bearer
entitlement key, server route still undeployed — contract in
`infra/entitlements/HANDOFF-sidecoin-api.md`) on launch (App.tsx), on key
activation/removal/refresh (Settings → Sidecoin PRO, appstore/dev only via
`IS_FDROID_BUILD`), and when a locked platform screen mounts. 200 applies +
caches (AsyncStorage `sidecoin.entitlementsCache.v1`), 401 wipes key + cache
and re-locks, anything else falls back cache → Basic. Local expiry
collapses the feature list to `BASIC_FEATURES` — an inactive paid plan is
the free tier. All gates (`useEntitlements()` hook + subscription bus)
re-render live. `entitlementsApi.test.ts` (16 tests) covers every response
class; `entitlementsFdroid.test.ts` pins the F-Droid all-unlocked
short-circuit (which never touches the network). **The app never links to
the checkout**: `sidecoin.app/pro` is plain-text mention only (store
policy); activation is key-paste. A shared in-memory AsyncStorage manual
mock lives at `__mocks__/@react-native-async-storage/async-storage.js`
because entitlements imports storage at module top. Web wallet
(`apps/wallet`) still uses the hardcoded constant — port tracked as
follow-up.

**The free tier is Alpha-metered, not hard-locked (26.10.24).**
`src/alpha.ts` is a Duolingo-Energy-style meter: basic-plan users
(appstore/dev flavors only) spend **Alpha** to use PRO features instead
of hitting a ProGate outright — cap 100, drain 100/hour while a PRO
screen is foregrounded (`useFocusEffect` → `beginProSession` in
`PlatformDetailScreen`), regen 8/hour while idle (full refill ~12.5 h),
plus an explicit per-action cost table (`ALPHA_ACTION_COSTS`) charged on
use (`spendAlpha` after a coin-control broadcast) and one-time,
daily-capped earn-back grants (`claimAlphaGrant`) tied to
on-chain-observable events (first L1 deposit, first broadcast, first
platform deposit — the caller verifies, the engine records). The
combined gates `canUseProFeature/Platform` replace hard-lock calls at UI
sites: plan-unlimited OR (metered AND `floor(balance) > 0`) — the floor
matches the displayed integer, so a sub-1 regen residue gates as "0"
(regression-pinned). Paid plans and the F-Droid flavor are unmetered and
see ZERO meter UI (`components/AlphaMeter.tsx` renders null; pill rides
the stack header next to `HeaderAvatar` + the dashboard heading,
tap-to-explain sheet with regen ETA + grant list). In-flight actions are
never hard-blocked: spends floor at 0, only starting at 0 is refused.
Low/critical banners at 25/10 (`alphaBalanceWarning`) render on metered
PRO screens. Client-side only for now (gameable; accepted — testnet
coins are worthless and no purchase path exists yet); the server-side
ledger is a pre-mainnet hard requirement specified in
`infra/entitlements/HANDOFF-sidecoin-api.md` §11. The word "Alpha" was
freed for the meter by renaming the top tier **Alpha Circle → Diamond
Circle** (`Plan` `"alpha"` → `"diamond"` in BOTH wallets, pricing/FAQ/
founders copy, leaderboard badge). Web port of the meter (like the
entitlements engine) is a follow-up. Tests: `alpha.test.ts` (17) plus
metered-model updates in the Send/Dashboard/PlatformDetail suites —
their helpers drain/refill through the REAL engine over mocked
`Date.now`, and each suite's `afterEach` refills so no test inherits an
empty tank. `AlphaMeter.test.tsx` (6 tests) covers the pill: the
`ALPHA_TICK_MS`/`tickAlpha()` live countdown (see gotcha 16), explainer
sheet, and the unlimited-plan null render. `ProBenefitsScreen`'s first
highlight card ("Sidecoin Alpha, unlimited") sells the meter removal.

### F-Droid release review checklist (run before every recipe version bump)

These gates were added after findings from MR 50457 reviews (linsui + mezinster).
Every item maps to a comment that cost a review round; run ALL of them before
pushing a recipe update.

1. **Exactly ONE `Builds` block — the latest.** F-Droid builds and publishes
   EVERY entry in `Builds:`; a stale block ships a stale (and previously
   flagged) APK. mezinster's note `3983603322` was exactly this: the 26.10.5
   update kept the 26.10.1 block, CI built both, and 26.10.1 was the build
   that still carried prebuilt OpenSSL. After a bump, verify
   `grep -c 'versionName:' metadata/app.sidecoin.yml` (fdroiddata copy) == 1
   and that it matches `build.gradle` + the release tag.
2. **The maintenance copy MUST be bumped in the SAME change as the version
   bump.** `apps/mobile/metadata/app.sidecoin.yml` was left at 26.10.1 while
   fdroiddata moved to 26.10.5 — it drifted because nothing enforced the
   pairing. Verify `versionName`/`versionCode`/`commit`/`CurrentVersion*`
   match `android/app/build.gradle` + `apps/mobile/package.json` + the
   peeled release tag (`git rev-parse vX.Y.Z^{}`).
3. **Re-verify hosted-binary facts against the actual asset each release.**
   `curl -sL` the `v%v` release's `app-fdroid-release.apk` and record the
   real byte size + sha256 in the comment — never copy a prior version's
   numbers. (The 26.10.5 asset is 28,685,558 bytes / `bb1dd147…830a`.)
4. **`fdroid rewritemeta app.sidecoin` → zero diff** in the fdroiddata
   checkout before every recipe push (CI enforces it; comments are stripped
   from the fdroiddata copy by design).
5. **Cross-check the listing against the app before submitting.** linsui +
   mezinster found the gap three ways: a "Deposit/withdraw" claim for
   `Pressable`s with NO `onPress` (`PlatformDetailScreen`), a "10 live
   sidechains" count that disagreed with `LAUNCH_SIDECHAINS` (11 entries),
   and an undescribed WebView browser + hardcoded Esplora hosts. Walk
   `full-description.txt` line by line against the screens and registry.
6. **The Skia `.a` scanignore question is deferred to the maintainers**
   (linsui) — it is NOT a blocker and needs no author action. Do not try to
   "fix" it unilaterally.
7. **Flavor-scoped string audit — grep, never memory.** After any flavor
   sweep, enumerate EVERY user-visible paid-tier string that renders when
   `IS_FDROID_BUILD === false`, and gate or reword each one. The 26.10.22
   sweep gated components/sections but never grepped strings, so two PRO
   mentions survived in `SettingsScreen.tsx` (Demo Mode hint; Founder
   Identity card → sidecoin.app/pro) despite the commit message claiming
   "no PRO mention anywhere" (junkerderprovinz, 2026-10-29). Never write an
   absolute claim ("no X anywhere") in a commit message without running the
   grep that proves it:
   `grep -rn 'PRO\b\|sidecoin\.app/pro\|Upgrade' apps/mobile/src/screens/ apps/mobile/src/components/`
   — every hit must be behind `!IS_FDROID_BUILD` or flavor-conditional.
8. **Enumerate self-rooted screens; verify insets on API 35+.** Any screen
   that does NOT use the shared `Screen` primitive applies its own top
   inset — maintain the list by grep, not inspection:
   `grep -rLn 'from "../components/ui"' apps/mobile/src/screens/*.tsx` plus
   `grep -ln 'style={styles.root}'`. The 26.10.22 inset sweep listed
   self-rooted screens from memory and missed `ExploreScreen` (toolbar
   rendered under the status bar). Verify on an **API-35+ emulator or
   device**: targetSdk 35 enforces edge-to-edge on Android 15+, and the
   overlap does NOT reproduce on the Android 14 test phone (Jest cannot
   render insets at all).
9. **Post-flavor-change walkthrough of every newly-unlocked screen.**
   Removing a gate changes what a fresh user sees — walk each
   newly-reachable screen and metric card for placeholder data. The zSide
   "Transparent Balance 2.25000000" literal (`PlatformDetailScreen.tsx`,
   transplanted verbatim from `apps/wallet` `PlatformDetailView.vue` in the
   Phase 4d port) was invisible behind the PRO gate until 26.10.22 ungated
   it and a reviewer found it on first open. Placeholders must be honest
   (`"—"` + "not connected/indexed yet", like the neighboring cards).

### F-Droid past review findings (each cost a round — do not repeat)

- **PRO leftovers + Explore inset + zSide mock literal in 26.10.22**
  (junkerderprovinz, 2026-10-29): Demo Mode hint said "PRO previews" and
  the Founder Identity card named sidecoin.app/pro, neither behind
  `IS_FDROID_BUILD`; `ExploreScreen` never applied the top inset (toolbar
  under the status bar on Android 15+); zSide "Transparent Balance
  2.25000000" was a hardcoded literal exposed when the flavor swap removed
  the gates. Root cause for all three: the sweep fixed its list but never
  verified the complement (all strings / all self-rooted screens / all
  newly-unlocked screens). Fixed on master; checklist items 7–9 are the
  regression gates.
- **26.10.1 block kept alongside 26.10.5** (mezinster `3983603322`): F-Droid
  built and published BOTH; only the latest may stay. Root cause: version
  bump didn't drop the superseded block.
- **Maintenance copy drifted** (ours, caught when fixing the above):
  `apps/mobile/metadata/app.sidecoin.yml` still pointed at 26.10.1 while
  fdroiddata was at 26.10.5. Root cause: no checklist item forced the pair.
- **Description promised unwired features** (mezinster `3950001768`):
  deposit/withdraw `Pressable`s had no `onPress`. Fix shipped: buttons
  disabled + "under development" notes + listing relabeled "IN DEVELOPMENT".
- **"10 live sidechains" vs 11 in `LAUNCH_SIDECHAINS`** (mezinster): Elements
  Plus marked "announced, coming soon" so the count adds up.
- **Undescribed WebView browser** (mezinster): `ExploreScreen` has an address
  bar + DuckDuckGo search + bookmarks; now described in the listing.
- **Undisclosed test-network-only status** (mezinster): listing gained a
  TEST NETWORKS section (signet/betanet, free test coins).
- **Undescribed hosted indexers** (mezinster): Esplora hosts + eCash Farm
  named in the listing; `NonFreeNet` reason added.
- **Prebuilt OpenSSL via quick-crypto prefab AAR** (mezinster `3950001768`):
  `io.github.ronickg:openssl` shipped `libcrypto.so`/`libssl.so`;
  `scandelete: node_modules` could NOT catch it because the binary arrived
  through Gradle, not npm. Fixed by dropping quick-crypto/nitro entirely
  (pure-JS `@noble`/`@scure` covers all wallet crypto; 52→44 `.so`).
- **Tailwind/NativeWind dropped as unused** (`2eb9a668`): zero `className`
  usage anywhere; styling is React Native `StyleSheet.create` (e.g.
  `components/ui.tsx`) driven by `src/theme/`. Tailwind was dead scaffold
  weight. Mobile styling is StyleSheet, NOT Tailwind — Tailwind lives only
  in `apps/wallet`/`apps/web`/`apps/explorer`/`apps/smarthub`.
  **Superseded in 26.10.12**: NativeWind was reintroduced, fully wired this
  time (the scaffold had the babel preset but no `global.css` and no
  `withNativeWind`, so it could never have functioned). className is now
  the shared styling language across all five apps; see the "Styling"
  paragraph in the React Native section above.

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
npx tsc --noEmit && npx jest      # 259 tests, 21 suites
cd android && ./gradlew assembleFdroidRelease
adb -s <serial> install -r app/build/outputs/apk/fdroid/release/app-fdroid-release.apk
```

- `applicationId app.sidecoin`, `versionCode 20261005`, `versionName 26.10.5`,
  minSdk 24, compileSdk/targetSdk 35, RN 0.81.1 / React 19.1.0, NDK
  `27.1.12297006`, Kotlin 2.0.21, Gradle 8.13. Release APK ~29 MB (26.10.5)
  after dropping quick-crypto/nitro/OpenSSL and NativeWind; earlier: 35 MB in
  26.10.1, ~148 MB before `reactNativeArchitectures` limited it to
  arm64-v8a + armeabi-v7a).
- Flavors `fdroid` / `appstore` (renamed from `playstore` in 26.10.23 — the
  same build targets Apple App Store and Google Play, so the name stays
  store-neutral; task names became `assembleAppstoreDebug` etc.). Sentry is
  `optionalDependencies`-scoped and
  `metro.config.js` resolves it to `src/lib/sentry-noop.ts` for every flavor
  EXCEPT `appstore`, so `fdroid` builds have no crash reporting (intentional,
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
14. **The appstore flavor crashed at startup until 26.10.23 with
    `IllegalArgumentException: DSN is required`.** `appstoreImplementation
    'io.sentry:sentry-android:7.14.0'` ships Sentry's `SentryInitProvider`
    ContentProvider, which auto-initializes at process start and throws when
    the manifest carries no `io.sentry.dsn` meta-data. Fixed by
    `<meta-data android:name="io.sentry.auto-init" android:value="false" />`
    in the MAIN `AndroidManifest.xml` (inert on fdroid — no Sentry classes):
    the JS layer owns initialization via `initSentry()` (`src/lib/sentry.ts`)
    with the shared placeholder DSN until GlitchTip lands
    (`infra/glitchtip/`). The crash only ever affected the appstore flavor;
    it surfaced on first appstore on-device run because every prior device
    install was fdroid.
15. **`onStateChange` belongs to `NavigationContainer`, not a navigator.**
    The root FAB lives *outside* `Stack.Navigator` and needs the focused
    route, so the container ref is shared through
    `src/navigation/ref.ts` (`createNavigationContainerRef`); `RootNavigator`
    subscribes via `navigationRef.addListener("state", …)`.
16. **Reads of the Alpha engine never notify subscribers.** `getAlphaState`/
    `getAlphaBalance` settle lazily but deliberately do NOT emit (they run
    during renders — emitting would setState mid-render). Any UI that must
    change over time without a user action must drive `tickAlpha()`
    (settle + persist + emit) on an interval — `AlphaMeter` does this at
    `ALPHA_TICK_MS` (20 s). A meter that only reads freezes at its mount
    value until a blur/navigation forces a settle: found on-device, the
    header showed 98 while the engine had already drained to 92. Regression-
    pinned by `AlphaMeter.test.tsx`'s fake-timer countdown test.

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
shared 254 (+1 skip) · wallet 422 · web 126 · explorer 43 · desktop 76 ·
smarthub 5 · mobile 289 (23 suites) · api-client 12 · observability 17.

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
   **The Founders / Diamond Circle deadline is a PRODUCT date, decoupled from
   the consensus fork date: December 31, 2026, end of day UTC** (countdown
   components target `2027-01-01T00:00:00Z`). `is_alpha` locks at THAT
   deadline, not at the fork. It lives in `apps/web` (`UrgencyBanner.astro`,
   `LiveStatsBar.astro`, `FAQ.astro`, `ProHero.astro`, `DiamondCircle.astro`,
   `DiamondCircleExplainer.astro`, `FoundersFooterCTA.astro`) and in
   sidecoin-api (`founders.ts` + `0001_founders.sql` comments). On a deadline
   change, grep `December 31` + `2027-01-01` in both repos. Never conflate the
   two dates: the fork countdown (`ForkCountdown.vue` et al.) always tracks
   consensus.
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
