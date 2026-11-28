// apps/mobile/src/thunder/service.ts
//
// The Thunder account service — the mobile thin-client wallet on top of the
// shared crypto stack (keys/addresses/FROST/Borsh/selection) and the
// drivechain-esplora client. Owns nothing: the mnemonic is passed in per
// call and held only transiently; persistent state is the public account
// key + revealed index (AsyncStorage, never secrets).
//
// Flow (thin node, pure client — keys never leave the device):
//   receive  → account pub key (cached) → address at revealed index
//   sync     → probe addresses in the revealed+gap window, fetch UTXOs +
//              deposits + history for used ones, compute the balance
//   send     → UTXOs → select → build → sign (one FROST Authorization per
//              input) → POST /tx (the node regenerates the utreexo proof)
//
// The gap limit mirrors BIP44: 20 past the revealed index; discovery walks
// further only while the trailing stretch keeps finding used addresses,
// capped so a hostile backend cannot make us derive forever.

import { mnemonicToSeed, thunder } from "@sidecoin/shared";
import type {
  ThunderKeySchemeId,
  ThunderNetworkId,
  ThunderPointedOutput,
} from "@sidecoin/shared";

import {
  broadcastThunderTransaction,
  esploraUtxoToPointedOutput,
  getThunderAddressInfo,
  getThunderAddressTxs,
  getThunderAddressUtxos,
  getThunderSidechainInfo,
  getThunderTipHeight,
  ThunderEsploraError,
  THUNDER_INDEX_EMPTY_STATUS,
  type ThunderEsploraTx,
} from "../api/thunderEsplora";
import {
  loadAccountPublicKey,
  loadRevealedIndex,
  saveAccountPublicKey,
  saveRevealedIndex,
} from "./store";

/** Addresses past the revealed index a sync still checks. */
export const THUNDER_GAP_LIMIT = 20;
/** Hard cap on discovery rounds (each round = one gap-limit batch). */
export const THUNDER_MAX_DISCOVERY_ROUNDS = 20;

/** Thunder account identity: the wallet + the Thunder deployment it lives
 * on. Betanet and mainnet keys differ (v18 vs v19 schemes) and are never
 * mixed. */
export interface ThunderAccount {
  /** Arbitrary stable id for the local stores (the app's wallet id). */
  walletId: string;
  /** The L1 network the account rides on (parent mainchain). */
  l1Network: string;
}

function deploymentFor(l1Network: string): ThunderNetworkId {
  const network = thunder.thunderNetworkFor(l1Network);
  if (network === null) {
    throw new Error(`No Thunder deployment on network "${l1Network}".`);
  }
  const config = thunder.THUNDER_NETWORKS[network];
  if (!config.backendAvailable) {
    throw new Error(
      `Thunder on ${network} has no public backend yet — the node's RPC is not exposed and no index exists. Blocked on L2L.`,
    );
  }
  return network;
}

function accountSeed(mnemonic: string): Uint8Array {
  return mnemonicToSeed(mnemonic, "");
}

/** The account public key (point + chain code), derived once and cached so
 * address listing never reads the keychain. */
export async function thunderAccountPublicKey(
  mnemonic: string,
  account: ThunderAccount,
): Promise<{ point: Uint8Array; chainCode: Uint8Array; scheme: string }> {
  const network = deploymentFor(account.l1Network);
  const scheme = thunder.THUNDER_NETWORKS[network].keyScheme;
  const cached = await loadAccountPublicKey(account.walletId, network);
  if (cached && cached.scheme === scheme) {
    return {
      point: thunder.fromHex(cached.point),
      chainCode: thunder.fromHex(cached.chainCode),
      scheme,
    };
  }
  const seed = accountSeed(mnemonic);
  const accountKey = thunder.deriveAccountKey(seed, scheme);
  const pub = thunder.toPublicKey(accountKey);
  await saveAccountPublicKey(
    { point: thunder.toHex(pub.point), chainCode: thunder.toHex(pub.chainCode), scheme },
    account.walletId,
    network,
  );
  return { point: pub.point, chainCode: pub.chainCode, scheme };
}

/** Addresses for a range of indices from the account PUBLIC key — no
 * mnemonic needed. */
export async function thunderAddresses(
  accountPub: { point: Uint8Array; chainCode: Uint8Array; scheme: string },
  indices: number[],
): Promise<string[]> {
  return indices.map((index) =>
    thunder.thunderAddress(
      thunder.deriveAddressPublicKey(
        { point: accountPub.point, chainCode: accountPub.chainCode },
        index,
        accountPub.scheme as ThunderKeySchemeId,
      ),
    ),
  );
}

/** The current receive address; `advance: true` moves to a fresh index
 * first ("New address" in the UI). */
export async function thunderReceiveAddress(
  mnemonic: string,
  account: ThunderAccount,
  advance: boolean,
): Promise<{ address: string; index: number }> {
  const network = deploymentFor(account.l1Network);
  const accountPub = await thunderAccountPublicKey(mnemonic, account);
  let index = await loadRevealedIndex(account.walletId, network);
  if (advance) {
    index += 1;
    await saveRevealedIndex(index, account.walletId, network);
  }
  const [address] = await thunderAddresses(accountPub, [index]);
  return { address, index };
}

/** The user-facing deposit wrapper `s<slot>_<addr>_<checksum>` — what the
 * M5 deposit flow shows (the OP_RETURN carries the BARE address; the
 * existing shared M5 builder takes care of that). */
export function thunderDepositString(address: string): string {
  return thunder.thunderDepositString(address);
}

/** One synced view of the account. `indexEmpty` means the backend is live
 * but the chain has no indexed blocks yet — an empty wallet, not an error. */
export interface ThunderAccountState {
  network: ThunderNetworkId;
  /** Spendable + mempool-pending balance (the index merges mempool UTXOs
   * and drops mempool-spent coins), sats. */
  balanceSats: string;
  /** Unspent outputs we own (value-content only; withdrawals excluded). */
  utxos: ThunderPointedOutput[];
  /** Confirmed history, newest first. */
  history: ThunderHistoryRow[];
  /** Sidechain tip height, or null when the index is empty. */
  tipHeight: number | null;
  /** Slot-9 escrow info: activation + treasury (the CTIP), when served. */
  sidechain: { activationHeight: number; treasuryValueSats: string } | null;
  indexEmpty: boolean;
}

/** A display row for history: net effect on OUR wallet per transaction. */
export interface ThunderHistoryRow {
  txid: string;
  /** ISO 8601, or null when the index cannot date it. */
  time: string | null;
  confirmed: boolean;
  /** Positive = received, negative = sent, in sats (string — u64 safe). */
  deltaSats: string;
  feeSats: string | null;
  blockHeight: number | null;
}

/** Full sync: probe the address window, pull UTXOs/deposits/history for
 * used addresses, walk discovery, return the account state. The mnemonic is
 * used only to derive the account public key (cached after the first
 * call). */
export async function syncThunderAccount(
  mnemonic: string,
  account: ThunderAccount,
): Promise<ThunderAccountState> {
  const network = deploymentFor(account.l1Network);
  const baseUrl = thunder.THUNDER_NETWORKS[network].thunderEsploraBaseUrl;

  let tipHeight: number | null;
  try {
    tipHeight = await getThunderTipHeight(baseUrl);
  } catch (e) {
    if (e instanceof ThunderEsploraError && e.status === THUNDER_INDEX_EMPTY_STATUS) {
      // Live index, empty chain: a wallet would hand out real addresses
      // while showing zero — report an empty state, not an error.
      return {
        network,
        balanceSats: "0",
        utxos: [],
        history: [],
        tipHeight: null,
        sidechain: null,
        indexEmpty: true,
      };
    }
    throw e;
  }

  const accountPub = await thunderAccountPublicKey(mnemonic, account);
  const revealed = await loadRevealedIndex(account.walletId, network);

  // Window = revealed + gap; discovery extends while the trailing stretch
  // keeps finding used addresses.
  const used = new Set<string>();
  const probe = async (indices: number[]): Promise<string[]> => {
    const addresses = await thunderAddresses(accountPub, indices);
    for (let i = 0; i < addresses.length; i++) {
      const info = await getThunderAddressInfo(baseUrl, addresses[i]);
      if (info.chain_stats.tx_count > 0 || info.mempool_stats.tx_count > 0) {
        used.add(addresses[i]);
      }
    }
    return addresses;
  };

  const windowStart = revealed;
  let windowEnd = revealed + THUNDER_GAP_LIMIT;
  await probe(range(windowStart, windowEnd));
  for (let round = 0; round < THUNDER_MAX_DISCOVERY_ROUNDS; round++) {
    const batchStart = windowEnd;
    const batchEnd = windowEnd + THUNDER_GAP_LIMIT;
    const batch = await probe(range(batchStart, batchEnd));
    const batchUsed = batch.some((a) => used.has(a));
    if (!batchUsed) break;
    windowEnd = batchEnd;
  }

  // Fetch UTXOs + history only for used addresses in the window.
  const usedAddresses = [...used];
  const utxos: ThunderPointedOutput[] = [];
  for (const address of usedAddresses) {
    const rows = await getThunderAddressUtxos(baseUrl, address);
    for (const row of rows) {
      utxos.push(esploraUtxoToPointedOutput(row, address));
    }
  }

  const spendable = utxos.filter((u) => u.output.content.kind === "value");
  const balance = spendable.reduce((sum, u) => sum + thunder.contentValueSats(u.output.content), 0n);

  const history = await thunderHistoryRows(baseUrl, usedAddresses);

  let sidechain: ThunderAccountState["sidechain"] = null;
  try {
    const info = await getThunderSidechainInfo(baseUrl);
    sidechain = {
      activationHeight: info.activation_height,
      treasuryValueSats: info.treasury ? String(info.treasury.value_sats) : "0",
    };
  } catch {
    // Not all deployments serve the drivechain routes; the balance stands.
  }

  return {
    network,
    balanceSats: balance.toString(),
    utxos: spendable,
    history,
    tipHeight,
    sidechain,
    indexEmpty: false,
  };
}

/** Net-effect history rows: received = outputs to us, sent = our inputs
 * spent (the fee shows on the sending tx). Newest first. */
export async function thunderHistoryRows(
  baseUrl: string,
  addresses: string[],
): Promise<ThunderHistoryRow[]> {
  const rows = new Map<string, ThunderHistoryRow>();
  for (const address of addresses) {
    const txs = await fetchAllPages(baseUrl, address);
    for (const tx of txs) {
      let delta = 0n;
      for (const vout of tx.vout) {
        if (vout.scriptpubkey_address === address) {
          delta += BigInt(vout.value);
        }
      }
      for (const vin of tx.vin) {
        if (vin.prevout && vin.prevout.scriptpubkey_address === address) {
          delta -= BigInt(vin.prevout.value);
        }
      }
      const existing = rows.get(tx.txid);
      if (existing) {
        existing.deltaSats = (BigInt(existing.deltaSats) + delta).toString();
      } else {
        rows.set(tx.txid, {
          txid: tx.txid,
          time: tx.status.block_time
            ? new Date(tx.status.block_time * 1000).toISOString()
            : null,
          confirmed: tx.status.confirmed,
          deltaSats: delta.toString(),
          feeSats: tx.fee >= 0 ? String(tx.fee) : null,
          blockHeight: tx.status.block_height,
        });
      }
    }
  }
  return [...rows.values()].sort((a, b) => {
    const ah = a.blockHeight ?? -1;
    const bh = b.blockHeight ?? -1;
    if (ah !== bh) return bh - ah;
    return a.txid < b.txid ? 1 : -1;
  });
}

async function fetchAllPages(baseUrl: string, address: string): Promise<ThunderEsploraTx[]> {
  const all: ThunderEsploraTx[] = [];
  let lastSeen: string | undefined;
  for (let page = 0; page < 20; page++) {
    const txs = await getThunderAddressTxs(baseUrl, address, lastSeen);
    all.push(...txs);
    // The index pages at 25; a short page means we are done.
    if (txs.length < 25) break;
    lastSeen = txs[txs.length - 1].txid;
  }
  return all;
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export interface ThunderSendResult {
  txid: string;
  feeSats: string;
  amountSats: string;
  changeSats: string;
}

/**
 * Send `amountSats` to a Thunder address: select coins locally, build the
 * transaction, sign one FROST Authorization per input (the mnemonic is
 * loaded only here), and POST the authorized transaction. The node fills
 * the utreexo proof; the seed never leaves the device.
 */
export async function sendThunder(
  mnemonic: string,
  account: ThunderAccount,
  destAddress: string,
  amountSats: bigint,
  satPerByte: bigint,
): Promise<ThunderSendResult> {
  const network = deploymentFor(account.l1Network);
  const baseUrl = thunder.THUNDER_NETWORKS[network].thunderEsploraBaseUrl;
  const scheme = thunder.THUNDER_NETWORKS[network].keyScheme;

  const state = await syncThunderAccount(mnemonic, account);
  if (state.indexEmpty) {
    throw new Error("Thunder: the index holds no blocks yet — nothing to spend.");
  }
  if (state.utxos.length === 0) {
    throw new Error("Thunder: no spendable UTXOs.");
  }

  const destBytes = thunder.thunderAddressBytesFromBase58(destAddress);
  const payment = { kind: "value", sats: amountSats } as const;
  const selection = thunder.selectCoins(state.utxos, payment, satPerByte);

  // Change goes to a FRESH index of our own, never back to an input's
  // address (privacy: change reveals the payment input owner).
  const accountPub = await thunderAccountPublicKey(mnemonic, account);
  const revealed = await loadRevealedIndex(account.walletId, network);
  const changeIndex = revealed + 1;
  const [changeAddress] = await thunderAddresses(accountPub, [changeIndex]);
  if (selection.changeSats > 0n) {
    await saveRevealedIndex(changeIndex, account.walletId, network);
  }

  const outputs: thunder.ThunderOutput[] = [
    { address: destBytes, content: { kind: "value", sats: amountSats } },
  ];
  if (selection.changeSats > 0n) {
    outputs.push({
      address: thunder.thunderAddressBytesFromBase58(changeAddress),
      content: { kind: "value", sats: selection.changeSats },
    });
  }

  const tx = thunder.buildThunderTransaction(selection.inputs, outputs);

  // Resolve each input's secret: one pass over the address window builds
  // address → secret for every distinct owner of the selected inputs.
  const seed = accountSeed(mnemonic);
  const accountKey = thunder.deriveAccountKey(seed, scheme);
  const secrets = secretsForInputs(accountKey, selection.inputs, scheme);

  const authorizations = thunder.authorizeThunderTransaction(
    tx,
    selection.inputs.map((u) => u.output.address),
    secrets,
  );
  const body = thunder.authorizedTransactionToJson(tx, authorizations);
  const txid = await broadcastThunderTransaction(baseUrl, body);
  return {
    txid,
    feeSats: selection.feeSats.toString(),
    amountSats: amountSats.toString(),
    changeSats: selection.changeSats.toString(),
  };
}

/** One pass over the address window (the sync already proved our coins
 * live in it): derive index keys until every distinct input owner is
 * resolved, then return the secrets aligned to `inputs`. */
function secretsForInputs(
  accountKey: ReturnType<typeof thunder.deriveAccountKey>,
  inputs: ThunderPointedOutput[],
  scheme: ThunderKeySchemeId,
): bigint[] {
  const wanted = new Map<string, bigint>();
  const unresolved = new Set<string>();
  for (const input of inputs) {
    const key = Array.from(input.output.address).toString();
    if (!wanted.has(key)) unresolved.add(key);
  }
  for (let index = 0; index < 400 && unresolved.size > 0; index++) {
    const key = thunder.deriveAddressKey(accountKey, index, scheme);
    const address = Array.from(
      thunder.thunderAddressBytes(thunder.baseMul(key.scalar)),
    ).toString();
    if (unresolved.has(address)) {
      wanted.set(address, key.scalar);
      unresolved.delete(address);
    }
  }
  if (unresolved.size > 0) {
    throw new Error("Thunder: could not resolve the key that owns an input (outside the address window).");
  }
  return inputs.map((input) => wanted.get(Array.from(input.output.address).toString())!);
}
