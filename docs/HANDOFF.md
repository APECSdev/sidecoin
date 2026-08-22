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

### What exists today

- **L1 receive addresses** are already wired in the wallet via
  `deriveReceiveAddress(mnemonic, network, index=0)` from
  `@sidecoin/shared` (BIP-84 P2WPKH). Consumed by:
  - `packages/wallet/src/views/ReceiveView.vue` (line ~42)
  - `packages/wallet/src/views/DashboardView.vue` (line ~156)
- **L2 drivechain receive addresses** are wired via
  `deriveDrivechainAddress(mnemonic, index=1)` from `@sidecoin/shared`
  (SLIP-0010 ed25519 + blake3 XOF 20 bytes + base58, path
  `m/1'/0'/0'/{index}'`, all hardened, slot-independent). Consumed by:
  - `packages/wallet/src/views/SidechainsView.vue` (line ~50)
- `SidechainsView.vue` only **shows** the derived L2 address for
  `VERIFIED_ADDRESS_SLOTS = new Set([9, 4])` (Thunder=9, BitAssets=4), and it
  derives a **single** address at index 1 for whichever sidechains match that
  set. There is **no per-chain derivation dispatch** yet — the same
  `deriveDrivechainAddress` string is shown for both slots.

### What is NOT in the repo yet (Snowside)

- There are **zero** references to "snowside" / "Snowside" anywhere in the
  monorepo today (verified with `grep -rni "snowside"`). It is not in the
  sidechain registry, not in `data/platforms.ts`, and not in the derivation
  module.
- The current `deriveDrivechainAddress` is documented as slot-independent and
  identical for Thunder (slot 9) and BitAssets (slot 4). It is **NOT** known
  whether Snowside uses the same scheme. The next agent MUST confirm
  Snowside's derivation scheme against its reference node implementation
  before reusing `deriveDrivechainAddress` for it.

### Where the derivation code lives (the files you will touch or read)

- `packages/shared/src/wallet/derivation.ts`
  - `deriveReceiveAddress` (line 70) — L1 P2WPKH.
  - `deriveDrivechainAddress` (line 132) — L2 ed25519/blake3/base58.
  - Header comment (lines 1–29) documents both schemes byte-for-byte.
- `packages/shared/src/wallet/index.ts` — re-exports derivation.
- `packages/shared/src/__tests__/derivation.test.ts` — canonical vectors for
  both functions (BIP-84 spec vectors + Thunder/BitAssets index-1/2/3
  vectors confirmed against `thunder-rust`).
- `packages/shared/src/sidechains/registry.ts` — the slot registry (no
  Snowside entry today).
- `packages/wallet/src/views/SidechainsView.vue` — the current L2 address UI
  surface (gated by `VERIFIED_ADDRESS_SLOTS`).
- `packages/wallet/src/data/platforms.ts` — static platform scaffolds
  (thunder, zside, bitnames, bitassets, photon, truthcoin, coinshift … no
  snowside).

### Suggested approach (confirm with the operator before implementing)

1. **Confirm Snowside's derivation scheme** against its reference node impl
   (the way `deriveDrivechainAddress` was confirmed against `thunder-rust`).
   Questions to answer:
   - Does Snowside reuse the SLIP-0010 ed25519 + blake3 + base58 scheme, or
     does it have its own?
   - What is the derivation path?
   - What index does address issuance start at (Thunder starts at 1)?
   - What is Snowside's BIP-300 slot number? (It is not in the registry.)
2. **Registry**: add Snowside to
   `packages/shared/src/sidechains/registry.ts` with its authoritative slot
   and `status`. Add it to `packages/wallet/src/data/platforms.ts` if the
   platforms UI should surface it.
3. **Derivation**: if Snowside's scheme matches Thunder's, the existing
   `deriveDrivechainAddress` already covers it (slot-independent). If it
   differs, add a Snowside-specific derivation function in
   `packages/shared/src/wallet/derivation.ts` with canonical test vectors in
   `packages/shared/src/__tests__/derivation.test.ts`.
4. **Wallet UI**: extend `SidechainsView.vue` (or a dedicated mining-target
   view) to derive + display per-chain mining receive addresses for Thunder
   and Snowside. Today the gate is `VERIFIED_ADDRESS_SLOTS = {9, 4}`; update
   it to include Snowside's slot once verified.
5. **Mining-context note**: the operator said the initial use is **mining
   targets**. Confirm whether a mining target address differs from a normal
   receive address on either chain (e.g. a dedicated payout derivation path)
   before wiring it up.
6. **Gates**: `pnpm --filter @sidecoin/shared test` and
   `pnpm --filter @sidecoin/wallet test` + both `type-check` must be green.

### Open questions to resolve with the operator before coding

- Is Snowside's derivation scheme the same as Thunder's
  (`deriveDrivechainAddress`), or different?
- What is Snowside's authoritative BIP-300 slot number?
- Does Snowside address issuance start at index 1 (like Thunder) or 0?
- Is the "mining target" address the same as the standard receive address,
  or a distinct derivation?
- Should Snowside appear in the platforms UI (`data/platforms.ts`) and the
  sidechains registry now, or only after derivation is verified?

## In-flight

(Nothing else in-flight. Add items here when work starts.)
