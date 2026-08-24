# HANDOFF.md — sidecoin (monorepo)

State of work and next steps for the `sidecoin` monorepo. Maintained as a
rolling log — update it when you finish a chunk of work so the next agent can
pick up exactly where you left off.

## Current state (last updated: post-API-extraction)

The monorepo just shed its API adapter. The Cloudflare Worker
(`packages/api`, formerly `@sidecoin/api`) was extracted into a standalone
repository: [`sidecoin-api`](https://github.com/APECSdev/sidecoin-api).

### Extraction commit

- `0709fe1 refactor: extract packages/api into standalone sidecoin-api repo`
  on `master`, pushed to `git@github.com:APECSdev/sidecoin.git`.

### What was done

1. **Deleted** `packages/api/` entirely (sources, routes, migrations, tests,
   `wrangler.toml`). All logic was copied verbatim into the new repo.
2. **`guardian.yml`**: removed the `@sidecoin/api` test/typecheck steps from
   the `api` job (the job is retained for `@sidecoin/api-client`, which stays
   here) and removed the entire `deploy-api` job. The Worker is now
   built/deployed from `sidecoin-api`. YAML re-validated.
3. **`README.md`**: dropped the `packages/api` line from the structure section
   and added a pointer to the new repo.
4. **Regenerated** `pnpm-lock.yaml` (the `packages/api` importer block is
   gone).

### Verification (all green)

| Check | Command | Result |
| --- | --- | --- |
| `@sidecoin/api-client` test | `pnpm --filter @sidecoin/api-client test` | 12 passed |
| `@sidecoin/api-client` typecheck | `pnpm --filter @sidecoin/api-client typecheck` | clean |
| `@sidecoin/shared` type-check | `pnpm --filter @sidecoin/shared type-check` | clean |
| `guardian.yml` YAML | `python3 -c "import yaml; yaml.safe_load(open(...))"` | valid |

### Sibling repo

- **`sidecoin-api`** (`git@github.com:APECSdev/sidecoin-api.git`) holds the
  extracted Worker. Its extraction commit is `7509176`. It vendors the
  sidechain registry into `src/sidechains.ts` so it carries no
  `@sidecoin/shared` dependency. See its own `AGENTS.md` / `docs/HANDOFF.md`.
- `@sidecoin/api-client` (here at `packages/api-client`) is unchanged and
  still talks to the Worker's public HTTPS surface.

## Next work item — Thunder + Snowside address generation (web wallet)

Operator's next ask: add **address generation** for Thunder and Snowside to
the **web wallet** (`@sidecoin/wallet`), initially just to produce **mining
targets** (receive addresses). This section captures the verified starting
facts so the next agent does not have to re-derive them.

### STATUS: DONE ✅

Both Thunder and Snowside address generation are now wired into the web
wallet's Platforms view (`SidechainsView.vue`). Commit:
`feat(wallet): Thunder + Snowside address generation`.

### What was implemented

1. **`deriveEvmAddress`** added to `packages/shared/src/wallet/derivation.ts` —
   standard EVM BIP-44 (`m/44'/60'/0'/0/{index}`, secp256k1, keccak-256,
   EIP-55 checksum, index from 0). Used for Snowside. Verified against the
   canonical all-"abandon" mnemonic Ethereum vector at indices 0/1/2.
2. **`@noble/curves` 2.2.0** added to `@sidecoin/shared` deps (for secp256k1
   public-key decompression). `@noble/hashes` 1.8.0 already shipped
   `keccak_256` via its `sha3` submodule (pre-NIST padding = Ethereum's).
3. **Snowside registered** in `packages/shared/src/sidechains/registry.ts` as
   `SIDECHAIN_SNOWSIDE`, slot **88** (requested — not yet officially
   assigned), `status: "proposed"`, `supportsBmm: true`, `infoUrl:
   "https://snowside.network"`. Added to `LAUNCH_SIDECHAINS` (now 10 entries).
4. **Snowside platform scaffold** added to
   `packages/wallet/src/data/platforms.ts` (id `snowside`, slot 88, status
   `proposed`, feature tabs: Address / BMM / EVM).
5. **`SidechainsView.vue`** refactored from a single shared L2 address to
   **per-slot** derivation: `ADDRESS_DERIVATION_SLOTS = {9, 4, 88}` with
   `EVM_ADDRESS_SLOTS = {88}` routing Snowside to `deriveEvmAddress` and
   Thunder/BitAssets to `deriveDrivechainAddress`. Thunder uses index 1
   (matches `get_new_address`); Snowside uses index 0 (standard EVM). Each
   card now shows its own distinct address.
6. **Entitlements**: `snowside` added to `BASIC_PLATFORM_IDS` +
   `BASIC_FEATURES` so address generation is available to everyone (it's the
   mining target). Intentionally NOT promoted to PRO.
7. **Tests**: shared +10 (EVM vectors + Snowside registry assertions),
   wallet +3 (Snowside renders at slot 88, EVM address shown, Thunder ≠
   Snowside addresses), explorer chains test updated for Snowside. Full
   monorepo green: 238 shared / 339 wallet / 43 explorer / 118 web.

### Snowside scheme confirmation (from operator)

- Standard EVM BIP-44, coin type 60 (same as Ethereum) ✅
- Address index starts at 0 ✅
- BIP-300 slot 88 requested (not yet official) ✅
- Payouts go to the standard EVM address (no separate payout path) ✅
- Snowside registered in the sidechain registry ✅

### Reference repos used

- Thunder: `https://github.com/LayerTwo-Labs/thunder-rust` —
  `types/authorization.rs` `get_address` (blake3_xof(verifying_key)[..20]) +
  `lib/wallet.rs` `get_signing_key` (SLIP-0010 ed25519, `m/1'/0'/0'/{index}'`).
  Already byte-faithfully implemented as `deriveDrivechainAddress`.
- Snowside: `https://github.com/abitsuite/snowside` — Avalanche L1 EVM,
  native BTC gas via BMM. The repo does NOT derive EVM addresses from a
  mnemonic anywhere (its federation `wallet.ts` only derives L1 deposit
  addresses; its EVM `account` comes from a raw `EWOQ_PRIVATE_KEY`). The
  standard EVM BIP-44 scheme is the correct one and matches what
  MetaMask/Rabby/viem produce from the same mnemonic.

### Historical context (pre-implementation, retained for reference)

The derivation code lives in `packages/shared/src/wallet/derivation.ts`:
- `deriveReceiveAddress` (L1 BIP-84 P2WPKH) — consumed by `ReceiveView.vue`
  + `DashboardView.vue`.
- `deriveDrivechainAddress` (L2 ed25519/blake3/base58, slot-independent,
  index from 1) — consumed by `SidechainsView.vue` for Thunder (9) +
  BitAssets (4).
- `deriveEvmAddress` (EVM BIP-44, coin type 60, index from 0) — NEW,
  consumed by `SidechainsView.vue` for Snowside (88).

The wallet UI surface is `packages/wallet/src/views/SidechainsView.vue`,
gated by `ADDRESS_DERIVATION_SLOTS = {9, 4, 88}` with `EVM_ADDRESS_SLOTS =
{88}` routing to the EVM derivation. Canonical test vectors are in
`packages/shared/src/__tests__/derivation.test.ts`.

## Next work item — Alphanet network + Receive page address selection

### STATUS: DONE ✅

Added the **Alphanet** practice network and a **network + address selector**
to the Receive page. Commit: `feat(wallet): Alphanet network + Receive page
address selector`.

### What was implemented

1. **`alphanet` added to `NetworkId`**
   (`packages/shared/src/types/network.ts`) — now 6 members: `mainnet`,
   `testnet`, `signet`, `regtest`, `l2l-signet`, `alphanet`. Alphanet is the
   ECX alpha practice network (a fork of mainnet with a PoW difficulty
   reset). Authoritative config: `https://drivechain.dev/config` (id
   `alphanet`, family `ecash`).
2. **`ECASH_ALPHANET` config** added to `packages/shared/src/chain/config.ts`.
   Because alphanet forks the mainnet UTXO set, it inherits mainnet's address
   format verbatim: coin type 0, bech32 HRP `"bc"`, P2PKH/P2SH version bytes
   `0x00`/`0x05`. Network params from drivechain.dev: magic `"eca5a104"`,
   fork height `963648`, P2P port `8533`, seed `seed.alpha.ecash.ninja`.
   `isProduction: false`; `sidechainsAtLaunch: 0`.
3. **Registered in `NETWORKS` + `NETWORK_IDS`**
   (`packages/shared/src/chain/networks.ts`). `DEFAULT_NETWORK_ID` is still
   `"signet"`.
4. **`coinTypeFor` updated** in `derivation.ts` + `signing.ts` (shared) and
   `hardware/network.ts` (wallet): returns 0 for `mainnet` + `alphanet`
   (mainnet fork), 1 for test networks.
5. **`coinIdFor`** (wallet hardware) returns `"btc"` for alphanet.
   **`btcNetworkFor`** (ledger) maps alphanet → `networks.bitcoin`.
6. **Receive page network selector** (`ReceiveView.vue`): a session-only
   Signet/Alphanet segmented control that re-derives the L1 address on
   switch. Switching networks resets the address index to 0. The selection is
   NOT persisted to the keystore — the wallet still targets signet by
   default.
7. **"Generate New Address" enabled** (`ReceiveView.vue`): the previously
   disabled button now cycles the address index (0 → 1 → 2 …), deriving a
   fresh address within the selected network. Session-only.
8. **Derivation path display is dynamic**: `m/84'/{coinType}'/0'/0/{index}`
   updates to reflect the selected network (coin type) and index. An
   "Address index" row was added to the address details.
9. **Tests**: shared +6 (alphanet config assertions, network registry
   counts 5→6, getTestNetworks 4→5, isValidNetworkId alphanet); wallet
   +5 (ReceiveView network selector renders, defaults to signet, alphanet
   re-derives with coin type 0, Generate New Address cycles index, switching
   networks resets index) + 2 (hardware/network alphanet coinType/coinId).
   Full monorepo green.

### Key decisions

- **Alphanet is a mainnet fork** — same addresses as mainnet (coin type 0,
  `bc` HRP). Confirmed by the drivechain.dev config (`"chain": "main"`) and
  the "fork of mainnet" description. The same mnemonic produces the same
  addresses on both chains.
- **Receive selector is session-only** — the operator confirmed it does NOT
  need to persist; it only needs to display in the UI. The keystore still
  hardcodes `network: "signet"`.
- **Only Signet + Alphanet are offered** on the Receive page (per the
  operator's request to switch between those two). The other 4 networks
  remain in `NETWORK_IDS` for completeness but are not surfaced in the UI.
- **rpcPort 8332** for alphanet is inherited from mainnet (not published in
  the drivechain.dev config) — update if the node software publishes a
  distinct port.
- **Platforms page sidechain switching** is out of scope for this session
  (operator's instruction #3) — it will be a follow-up.

## Next work item — Fork date pushback + Snowside description trim + Platforms polish

### STATUS: DONE ✅

Updated the fork activation date across the entire repo and trimmed the
Snowside platform description. Commits: `fix(wallet): Platforms page shows
addresses on API failure + Snowside ordering + Go PRO!`,
`fix: update fork date to 2026-10-31 / block ~973,728 + trim Snowside text`.

### What was implemented

1. **Fork date pushed back to October 31, 2026** (block ~973,728, 15:00 UTC).
   Authoritative source: [ecash.com](https://ecash.com) — the live page title
   says "Mainnet Block ~973,728" and the bundled JS
   (`/assets/index-*.js`) hard-codes `2026-10-31T15:00:00Z`. The previous
   target was Aug 21, 2026 / block ~964,000. Updated everywhere it appeared:
   - `packages/shared/src/chain/config.ts` — every `ChainConfig.fork`
     (mainnet, testnet, signet, l2l-signet). Regtest (block 0) and alphanet
     (963,648 from drivechain.dev) are unchanged.
   - `packages/shared/src/types/network.ts` doc comments.
   - `packages/shared/src/chain/utils.ts` subsidy comment.
   - `packages/web` — `ForkCountdown.vue`, `UrgencyBanner.astro`,
     `LiveStatsBar.astro`, `pages/index.astro`.
   - `packages/wallet` + `packages/desktop` — dashboard/settings display
     strings + Rust node log line.
   - `README.md`.
   - Tests: `chain-config.test.ts` (fork height 973_728, countdown
     relative dates moved to Oct 30 / Nov 1, subsidy test label),
     `pro-page.test.ts` (FORK_DATE assertions → Oct 31 / month 9 / day 31,
     countdown "from" → 2026-10-11, "after" → 2026-11-01),
     `mobile/App.test.tsx` (timestamp literal + block-height regex /973/).
2. **Platforms page polish** (from the preceding commit):
   - `SidechainsView.vue` now falls back to the static `PLATFORMS` registry
     when the live `getSidechains()` API call fails, so locally-derived
     Thunder/Snowside addresses (no network needed) stay visible. The error
     is a non-fatal banner, not a full-page error.
   - Snowside ordered right after Thunder (before zSide) via
     `PLATFORM_DISPLAY_PRIORITY.snowside = 2`.
   - Header CTA text `"View PRO benefits"` → `"Go PRO!"`.
3. **Snowside description trimmed** in `packages/wallet/src/data/platforms.ts`:
   removed the trailing "BIP-300 slot 88 has been requested but is not yet
   officially assigned." sentence (per operator — text was too long). The
   "Proposed" status badge is retained.
4. **AGENTS.md** — added convention #7 (fork date + grep recipe) and #8
   (primary external sources, including the
   [ecash-com/fast-facts](https://github.com/ecash-com/fast-facts)
   integration guide). Fixed a duplicated item-number (two #5s).

### Note on the fast-facts README

The `ecash-com/fast-facts` README (last updated 2026-08-11) still lists the
OLD fork target (block ~963,648, August 22, 2026). It lags behind the live
ecash.com site, which now shows block ~973,728 / October 31, 2026. The live
site is authoritative for the fork date; fast-facts remains useful for
stable facts (network magic/ports, replay protection, node software,
address-format parity with Bitcoin).

## Next work item — Public Esplora fallback + Signet/Alphanet network toggle

### STATUS: DONE ✅

Restored L1 wallet balance display (the sidecoin.app/v1 adapter is offline)
by routing L1 reads + broadcast through the public Esplora endpoints from
[drivechain.dev/config](https://drivechain.dev/config), and added a
definitive, persisted Signet/Alphanet network toggle (Settings + Sidebar).

### What was implemented

1. **Public Esplora fallback for L1** (`packages/wallet/src/api/index.ts`):
   - New `L1Network` type (`"signet" | "alphanet"`) + `ESPLORA_BASES` map:
     signet → `https://esplora.signet.drivechain.info`, alphanet →
     `https://esplora.alpha.ecash.ninja` (both from drivechain.dev/config).
   - `esploraGetChainBalance` — `GET /address/:addr` → `ChainBalance`
     (confirmed = `chain_stats.funded - spent`; `seen` = any history;
     `updatedAtHeight` = `GET /blocks/tip/height`).
   - `esploraGetUtxos` — `GET /address/:addr/utxo` → `UtxosResult`, deriving
     each UTXO's P2WPKH `scriptPubKey` from the address (Esplora /utxo
     doesn't return it) via the new `scriptPubKeyFromAddress` helper.
     `minConfirmations` applied client-side.
   - `esploraBroadcast` — `POST /tx` → `BroadcastReceipt` (txid on success).
   - `getL1Balance`, `getL1Utxos`, `broadcastTransaction`, `getRawTransaction`
     are now network-aware (extra `network: L1Network = "signet"` arg, default
     signet for back-compat) and route to Esplora. They return the SAME shapes
     the views already consume, so views only needed to pass
     `wallet.network`.
   - `getSidechains` / `getDeposits` / `getWalletBalance` still hit the
     adapter client (sidechain/L2, not L1) and will fail until the adapter
     returns — the Dashboard platform-activity section degrades gracefully
     (it already falls back to the static PLATFORMS list).
2. **`scriptPubKeyFromAddress`** (`packages/shared/src/wallet/derivation.ts`):
   decodes a bech32 SegWit address → `OP_<ver> <push len> <program>` hex.
   Exported from `@sidecoin/shared`. +4 derivation tests.
3. **Persistent Signet/Alphanet network toggle**
   (`packages/wallet/src/keystore.ts`):
   - `StoredWallet.network` broadened from literal `"signet"` to
     `WalletNetwork = "signet" | "alphanet"`.
   - `setWalletNetwork(network)` persists the change + dispatches
     `WALLET_NETWORK_EVENT` (a `CustomEvent`) so live views re-fetch.
   - `loadWallet()` coerces any unknown network field back to `"signet"`
     (forward-compat with pre-toggle wallets). +6 keystore tests.
4. **Settings toggle** (`packages/wallet/src/views/SettingsView.vue`): a
   prominent "L1 Network" card at the top of Settings with Signet/Alphanet
   option buttons; persists via `setWalletNetwork` and shows "Saved ✓".
   +6 SettingsView tests.
5. **Sidebar + mobile-header badge** (`packages/wallet/src/App.vue`): the
   active network is shown under the title in the desktop sidebar (with a
   "change" link to /settings) and as a pill in the mobile top bar. Reactive
   to `WALLET_NETWORK_EVENT`. Also fixed a stale `2026·08·21` date in the
   mobile header → `2026·10·31`. +4 App tests.
6. **Receive page now persists** (`packages/wallet/src/views/ReceiveView.vue`):
   the Signet/Alphanet selector on Receive now saves to the keystore (was
   session-only) and listens for `WALLET_NETWORK_EVENT` so it stays in sync
   with Settings. Tests updated.
7. **Views pass `wallet.network`** to the L1 calls: `DashboardView.vue`
   (balance + reactive network label on the L1 card + re-fetches on
   `WALLET_NETWORK_EVENT`), `SendView.vue`, `CoinNewsComposer.vue`,
   `HardwareWalletView.vue` (narrows to `l1Network` for the API calls).
   +18 Esplora API tests in `api.test.ts`.

### Endpoints verified against the live services

- `GET /address/:addr` → `{ chain_stats, mempool_stats }` (funded/spent sums).
- `GET /address/:addr/utxo` → `[{ txid, vout, value, status:{confirmed,block_height} }]`.
- `POST /tx` → txid (plain text) on success; `sendrawtransaction` RPC error
  body on failure (broadcast works — verified with an empty-body POST that
  returned a TX-decode RPC error, proving the endpoint accepts txs).
- `GET /tx/:txid/hex` → raw hex.
- `GET /blocks/tip/height` → tip height (signet 10808, alphanet 987875 at
  probe time).

### Test baselines

shared 248 passed + 1 skipped · wallet 379 passed · web 118 · desktop 76 ·
mobile 21 · explorer 43 · api-client 12 · smarthub 5. All type-checks clean.

## Next work item — ECX market price (eCash Farm) + Coin News UI + sidebar polish

### STATUS: DONE ✅

Replaced the offline SupaQt market-price source with the eCash Farm
`projected.ecxUsd` projection, polished the Coin News stats box layout,
and added breathing room below the sidebar Settings link. Commit:
`feat(wallet): Esplora balance fallback + Signet/Alphanet toggle + eCash
Farm price + UI fixes` (`528265e`, pushed) + the follow-up label/time edits
in this commit.

### What was implemented

1. **ECX market price → eCash Farm** (`packages/wallet/src/api/index.ts`):
   - New `ECASHFARM_BASE_URL = "https://ecashfarm.com/v1"` constant (next
     to `SUPAQT_BASE_URL`).
   - `getMarketPrice(asset)` rewritten to `GET /v1/markets` and read
     `projected.ecxUsd` (a forward-looking fair-value projection, not a
     last-trade print). Returns the SAME `MarketPrice` shape (`asset`,
   - `name`, `price_usd`, `source`, `as_of`) so the Dashboard consumes it
     unchanged: `source` is `"eCash Farm"`, `price_usd` is the projection
     formatted to 2 decimals, `as_of` is the upstream `updatedAt` epoch
     seconds as an ISO string. Non-ECX aliases are coerced to `"ecash"`.
   - Throws on non-OK responses or a missing/non-numeric `ecxUsd`.
2. **Dashboard market-price card** (`packages/wallet/src/views/DashboardView.vue`):
   - Label changed from "ECX Market Price" → **"ECX (Projected) Market
     Price"**.
   - Source badge changed from a static "SupaQt" pill → a linked
     **"eCash Farm ↗"** anchor (`href="https://ecashfarm.com"`, opens in a
     new tab, `data-test="market-price-source"`).
   - Timestamp rendered with a new `formatLocalTime(iso)` helper
     (`toLocaleString` with year/month/day + 2-digit time) instead of the
     raw ISO string.
   - Price line shows just `USD <price>` — the `asset`/`eCash` suffix span
     was removed.
3. **Coin News stats box** (`packages/wallet/src/components/bitnames/CoinNewsPreview.vue`):
   the Posts/Feeds/Network box was overlapping its rounded border on narrow
   widths. Fixed by accommodating the box in the flex parent rather than
   shrinking the text:
   - Added `shrink-0` + `self-start` to the grid so the `lg:flex-row` parent
     no longer compresses it.
   - `whitespace-nowrap` on each value so labels never wrap into the
     divider or border.
   - Column gap `gap-x-4`, container padding `p-3`, cell padding `px-3`.
   - All three values keep the original `text-lg font-black` size (no
     truncation, no down-sizing).
4. **Sidebar spacing** (`packages/wallet/src/App.vue`): added `mb-4` to the
   nav `<ul>` so the Settings link no longer touches the "Sidecoin Basic"
   card below it.
5. **Mobile header date** (`packages/wallet/src/App.vue`): fixed a stale
   `2026·08·21` → `2026·10·31` (left over from the fork-date pushback).

### Endpoints verified

- `GET https://ecashfarm.com/v1/markets` →
  `{ ok, updatedAt, projected: { ecxUsd, marketCap, poolSize,
  referencePriceUsd, maxPoolSize }, creatorWallet, token, source }`.
  `projected.ecxUsd` is a `number` (e.g. `106.47…`); `updatedAt` is epoch
  seconds.

### Test updates

- `api.test.ts`: replaced the two old SupaQt market-price tests with eCash
  Farm equivalents (loads `projected.ecxUsd`, coerces aliases, rounds to 2
  decimals, throws on non-OK + missing/NaN `ecxUsd`). Added a dedicated
  `getMarketPrice — eCash Farm /v1/markets` describe block (5 tests).
- `DashboardView.test.ts`: label assertion → "ECX (Projected) Market
  Price"; added `market-price-source` link assertions (href + text).

### Test baselines (post-this-commit)

shared 248 passed + 1 skipped · wallet **379 passed** · web 118 · desktop
76 · mobile 21 · explorer 43 · api-client 12 · smarthub 5. All type-checks
clean.

## In-flight

(Nothing else in-flight. Add items here when work starts.)
