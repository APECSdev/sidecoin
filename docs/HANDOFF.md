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

## In-flight

(Nothing else in-flight. Add items here when work starts.)
