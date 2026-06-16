#!/usr/bin/env node
/**
 * scripts/compare-explorer.mjs
 *
 * Smoke/parity test for the deployed Sidecoin explorer data path.
 *
 * Compares:
 *   1. Official Signet mempool-style explorer -> Sidecoin API L1
 *   2. SupaQt BitNames -> Sidecoin API BitNames
 *   3. SupaQt Thunder -> Sidecoin API Thunder
 *
 * Usage:
 *   node scripts/compare-explorer.mjs
 *
 * Optional env overrides:
 *   SIDECOIN_API_BASE=https://sidecoin.app/v1
 *   OFFICIAL_SIGNET_API_BASE=https://explorer.signet.drivechain.info/api
 *   SUPAQT_API_BASE=https://supaqt.com/v1
 *   L1_TXID=f5f1...
 *   L1_BLOCK_HEIGHT=1061
 *   BITNAMES_TXID=9548...
 *   BLOCK_LIMIT=10
 */

const SIDECOIN_API_BASE =
  process.env.SIDECOIN_API_BASE ?? "https://sidecoin.app/v1";

const OFFICIAL_SIGNET_API_BASE =
  process.env.OFFICIAL_SIGNET_API_BASE ??
  "https://explorer.signet.drivechain.info/api";

const SUPAQT_API_BASE = process.env.SUPAQT_API_BASE ?? "https://supaqt.com/v1";

const L1_TXID =
  process.env.L1_TXID ??
  "f5f1c645c942909161604d3046ffb39a88e1dd740c884161b87b28f23ef7c82a";

const L1_BLOCK_HEIGHT = Number(process.env.L1_BLOCK_HEIGHT ?? "1061");

const BITNAMES_TXID =
  process.env.BITNAMES_TXID ??
  "95488f2ed8a822404091bb1d71da8512745a9ee86e3497c3e6f1527ec1782716";

const BLOCK_LIMIT = Number(process.env.BLOCK_LIMIT ?? "10");

const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? "15000");

let failures = 0;
let checks = 0;

function section(title) {
  console.log(`\n\n=== ${title} ===`);
}

function pass(message) {
  checks += 1;
  console.log(`✅ ${message}`);
}

function fail(message, details) {
  checks += 1;
  failures += 1;
  console.error(`❌ ${message}`);
  if (details !== undefined) {
    console.error(formatDetails(details));
  }
}

function info(message) {
  console.log(`ℹ️  ${message}`);
}

function formatDetails(details) {
  if (typeof details === "string") return details;
  return JSON.stringify(details, null, 2);
}

function cleanBase(base) {
  return base.replace(/\/+$/, "");
}

function url(base, path) {
  return `${cleanBase(base)}${path}`;
}

async function fetchWithTimeout(resource, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(resource, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(resource) {
  const res = await fetchWithTimeout(resource);
  const text = await res.text();

  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(
      `Expected JSON from ${resource}, got status ${res.status}: ${text.slice(
        0,
        240,
      )}`,
    );
  }

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} from ${resource}: ${JSON.stringify(body).slice(
        0,
        500,
      )}`,
    );
  }

  return body;
}

async function fetchText(resource) {
  const res = await fetchWithTimeout(resource, {
    headers: {
      accept: "text/plain",
    },
  });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${resource}: ${text.slice(0, 500)}`);
  }

  return text.trim();
}

function assertEqual(label, actual, expected) {
  if (actual === expected) {
    pass(label);
  } else {
    fail(label, { actual, expected });
  }
}

function assertTruthy(label, value) {
  if (value) {
    pass(label);
  } else {
    fail(label, { actual: value, expected: "truthy" });
  }
}

function assertClose(label, actual, expected, tolerance) {
  const a = Number(actual);
  const b = Number(expected);

  if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance) {
    pass(`${label} within ±${tolerance}`);
  } else {
    fail(`${label} within ±${tolerance}`, { actual, expected, tolerance });
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sumOfficialOutputs(tx) {
  return asArray(tx.vout).reduce((sum, output) => {
    return sum + BigInt(output.value ?? 0);
  }, 0n);
}

function sumSidecoinOutputs(tx) {
  return asArray(tx.outputs).reduce((sum, output) => {
    return sum + BigInt(output.valueSats ?? "0");
  }, 0n);
}

function bitsNumberToHex(bits) {
  if (typeof bits !== "number" || !Number.isFinite(bits)) return null;
  return bits.toString(16).padStart(8, "0");
}

function blocksByHeight(blocks) {
  const out = new Map();

  for (const block of asArray(blocks)) {
    if (typeof block.height === "number") {
      out.set(block.height, block);
    }
  }

  return out;
}

async function compareL1Transaction() {
  section("L1 transaction: official explorer vs Sidecoin API");

  const official = await fetchJson(
    url(OFFICIAL_SIGNET_API_BASE, `/tx/${L1_TXID}`),
  );
  const sideBody = await fetchJson(
    url(SIDECOIN_API_BASE, `/chains/l1/transactions/${L1_TXID}`),
  );
  const side = sideBody.transaction;

  assertEqual("txid", side.txid, official.txid);
  assertEqual("status confirmed", side.status, official.status.confirmed ? "confirmed" : "mempool");
  assertEqual("block height", side.blockHeight, official.status.block_height);
  assertEqual("block hash", side.blockHash, official.status.block_hash);
  assertEqual("timestamp", side.timestamp, official.status.block_time);
  assertEqual("size", side.size, official.size);
  assertEqual("vsize", side.vsize, official.vsize);
  assertEqual("weight", side.weight, official.weight);
  assertEqual("version", side.version, official.version);
  assertEqual("locktime", side.locktime, official.locktime);
  assertEqual("fee sats", side.feeSats, String(official.fee));
  assertEqual("output total sats", sumSidecoinOutputs(side).toString(), sumOfficialOutputs(official).toString());

  // SupaQt currently rounds/derives this slightly differently than mempool,
  // so compare with tolerance rather than exact equality.
  assertClose("fee rate", side.feeRate, official.feePerVsize, 0.25);

  assertEqual("input count", asArray(side.inputs).length, asArray(official.vin).length);
  assertEqual("output count", asArray(side.outputs).length, asArray(official.vout).length);

  for (let i = 0; i < Math.min(asArray(side.inputs).length, asArray(official.vin).length); i += 1) {
    const a = official.vin[i];
    const b = side.inputs[i];

    assertEqual(`input ${i} previous txid`, b.previousTxid, a.txid);
    assertEqual(`input ${i} vout`, b.vout, a.vout);
    assertEqual(`input ${i} address`, b.address, a.prevout?.scriptpubkey_address ?? null);
    assertEqual(`input ${i} value sats`, b.valueSats, String(a.prevout?.value ?? ""));
  }

  for (let i = 0; i < Math.min(asArray(side.outputs).length, asArray(official.vout).length); i += 1) {
    const a = official.vout[i];
    const b = side.outputs[i];

    assertEqual(`output ${i} vout`, b.vout, i);
    assertEqual(`output ${i} address`, b.address, a.scriptpubkey_address ?? null);
    assertEqual(`output ${i} value sats`, b.valueSats, String(a.value ?? ""));
    assertEqual(`output ${i} scriptPubKey`, b.scriptPubKey, a.scriptpubkey ?? null);
  }
}

async function compareL1BlockDetail() {
  section("L1 block detail: official explorer vs Sidecoin API");

  const officialHash = await fetchText(
    url(OFFICIAL_SIGNET_API_BASE, `/block-height/${L1_BLOCK_HEIGHT}`),
  );
  const official = await fetchJson(
    url(OFFICIAL_SIGNET_API_BASE, `/block/${officialHash}`),
  );
  const sideBody = await fetchJson(
    url(SIDECOIN_API_BASE, `/chains/l1/blocks/${L1_BLOCK_HEIGHT}`),
  );
  const side = sideBody.block;

  assertEqual("block height", side.height, official.height);
  assertEqual("block hash", side.hash, official.id);
  assertEqual("previous hash", side.previousHash, official.previousblockhash);
  assertEqual("timestamp", side.timestamp, official.timestamp);
  assertEqual("transaction count", side.transactionCount, official.tx_count);
  assertEqual("size", side.size, official.size);
  assertEqual("weight", side.weight, official.weight);
  assertEqual("merkle root", side.merkleRoot, official.merkle_root);
  assertEqual("version", side.version, official.version);
  assertEqual("nonce", side.nonce, official.nonce);
  assertEqual("bits", side.bits, bitsNumberToHex(official.bits));
  assertClose("difficulty", side.difficulty, official.difficulty, 1e-15);
  assertTruthy("txids include known tx", asArray(side.txids).includes(L1_TXID));
}

async function compareL1LatestBlocks() {
  section("L1 latest blocks: official explorer vs Sidecoin API");

  const official = await fetchJson(url(OFFICIAL_SIGNET_API_BASE, "/blocks"));
  const sideBody = await fetchJson(
    url(SIDECOIN_API_BASE, `/chains/l1/blocks?limit=${BLOCK_LIMIT}`),
  );
  const side = asArray(sideBody.blocks);

  const officialByHeight = blocksByHeight(official);
  const sideByHeight = blocksByHeight(side);
  const sharedHeights = [...sideByHeight.keys()]
    .filter((height) => officialByHeight.has(height))
    .sort((a, b) => b - a)
    .slice(0, BLOCK_LIMIT);

  assertTruthy(
    `shared latest heights >= ${Math.min(3, BLOCK_LIMIT)}`,
    sharedHeights.length >= Math.min(3, BLOCK_LIMIT),
  );

  for (const height of sharedHeights) {
    const a = officialByHeight.get(height);
    const b = sideByHeight.get(height);

    assertEqual(`block ${height} hash`, b.hash, a.id);
    assertEqual(`block ${height} timestamp`, b.timestamp, a.timestamp);
    assertEqual(`block ${height} tx count`, b.transactionCount, a.tx_count);
    assertEqual(`block ${height} size`, b.size, a.size);
    assertEqual(`block ${height} weight`, b.weight, a.weight);
  }
}

async function compareBitNamesTransaction() {
  section("BitNames transaction: SupaQt vs Sidecoin API");

  const supaqt = await fetchJson(
    url(SUPAQT_API_BASE, `/chains/bitnames/transactions/${BITNAMES_TXID}`),
  );
  const sideBody = await fetchJson(
    url(SIDECOIN_API_BASE, `/chains/bitnames/transactions/${BITNAMES_TXID}`),
  );
  const side = sideBody.transaction;

  assertEqual("txid", side.txid, supaqt.txid);
  assertEqual("status", side.status, supaqt.status);
  assertEqual("block height", side.blockHeight, supaqt.block_height);
  assertEqual("block hash", side.blockHash, supaqt.block_hash);
  assertEqual("timestamp", side.timestamp, supaqt.timestamp);
  assertEqual("total output sats", side.totalOutputSats, supaqt.total_output_sats);
  assertEqual("fee sats", side.feeSats, supaqt.fee_sats);
  assertEqual("input count", asArray(side.inputs).length, asArray(supaqt.inputs).length);
  assertEqual("output count", asArray(side.outputs).length, asArray(supaqt.outputs).length);

  for (let i = 0; i < Math.min(asArray(side.outputs).length, asArray(supaqt.outputs).length); i += 1) {
    const a = supaqt.outputs[i];
    const b = side.outputs[i];

    assertEqual(`output ${i} vout`, b.vout, a.vout);
    assertEqual(`output ${i} address`, b.address, a.address);
    assertEqual(`output ${i} value sats`, b.valueSats, a.value_sats);
    assertEqual(`output ${i} spent`, b.spent, a.spent);
  }
}

async function compareThunderBlocks() {
  section("Thunder latest blocks: SupaQt vs Sidecoin API");

  const supaqt = await fetchJson(
    url(SUPAQT_API_BASE, `/chains/thunder/blocks?limit=${BLOCK_LIMIT}`),
  );
  const sideBody = await fetchJson(
    url(SIDECOIN_API_BASE, `/chains/thunder/blocks?limit=${BLOCK_LIMIT}`),
  );

  const supaqtByHeight = blocksByHeight(supaqt.blocks);
  const sideByHeight = blocksByHeight(sideBody.blocks);
  const sharedHeights = [...sideByHeight.keys()]
    .filter((height) => supaqtByHeight.has(height))
    .sort((a, b) => b - a)
    .slice(0, BLOCK_LIMIT);

  assertTruthy(
    `shared Thunder heights >= ${Math.min(3, BLOCK_LIMIT)}`,
    sharedHeights.length >= Math.min(3, BLOCK_LIMIT),
  );

  for (const height of sharedHeights) {
    const a = supaqtByHeight.get(height);
    const b = sideByHeight.get(height);

    assertEqual(`thunder block ${height} hash`, b.hash, a.hash);
    assertEqual(`thunder block ${height} previous hash`, b.previousHash, a.previous_hash);
    assertEqual(`thunder block ${height} timestamp`, b.timestamp, a.timestamp);
    assertEqual(`thunder block ${height} tx count`, b.transactionCount, a.transaction_count);
    assertEqual(`thunder block ${height} size`, b.size, a.size);
    assertEqual(`thunder block ${height} weight`, b.weight, a.weight);
  }
}

async function compareExplorerFrontendSmoke() {
  section("Explorer frontend route smoke");

  const explorerBase =
    process.env.EXPLORER_BASE ?? "https://explorer.sidecoin.app";

  const routes = [
    "/l1",
    `/l1/block/${L1_BLOCK_HEIGHT}`,
    `/l1/tx/${L1_TXID}`,
    "/bitnames",
    `/bitnames/tx/${BITNAMES_TXID}`,
    "/thunder",
  ];

  for (const routePath of routes) {
    const res = await fetchWithTimeout(`${cleanBase(explorerBase)}${routePath}`, {
      headers: {
        accept: "text/html",
      },
    });
    const text = await res.text();

    if (!res.ok) {
      fail(`frontend ${routePath} returns 2xx`, {
        status: res.status,
        body: text.slice(0, 240),
      });
      continue;
    }

    assertTruthy(
      `frontend ${routePath} returns app shell`,
      text.includes("SidΞcoin Explorer") || text.includes('<div id="app">'),
    );
  }
}

async function main() {
  console.log("Sidecoin Explorer parity smoke test");
  console.log("");
  console.log(`SIDECOIN_API_BASE=${SIDECOIN_API_BASE}`);
  console.log(`OFFICIAL_SIGNET_API_BASE=${OFFICIAL_SIGNET_API_BASE}`);
  console.log(`SUPAQT_API_BASE=${SUPAQT_API_BASE}`);
  console.log(`L1_TXID=${L1_TXID}`);
  console.log(`L1_BLOCK_HEIGHT=${L1_BLOCK_HEIGHT}`);
  console.log(`BITNAMES_TXID=${BITNAMES_TXID}`);
  console.log(`BLOCK_LIMIT=${BLOCK_LIMIT}`);

  try {
    await compareL1Transaction();
    await compareL1BlockDetail();
    await compareL1LatestBlocks();
    await compareBitNamesTransaction();
    await compareThunderBlocks();
    await compareExplorerFrontendSmoke();
  } catch (e) {
    failures += 1;
    console.error("\n\n💥 Smoke test crashed");
    console.error(e instanceof Error ? e.stack ?? e.message : e);
  }

  section("Summary");

  if (failures === 0) {
    console.log(`✅ ${checks} checks passed`);
    process.exit(0);
  }

  console.error(`❌ ${failures} failure(s) across ${checks} checks`);
  process.exit(1);
}

await main();
