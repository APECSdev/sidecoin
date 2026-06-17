// packages/explorer/scripts/smoke-api.mjs
//
// Manual live API smoke check for indexed explorer chains.
//
// This intentionally does not run as part of normal unit tests or deploy gates.
// It verifies that the public API endpoints used by active explorer chains
// return sane JSON without relying on runtime mock data.

const API_BASE =
  process.env.SIDECOIN_API_BASE ??
  process.env.VITE_SIDECOIN_API_BASE ??
  "https://sidecoin.app/v1";

const INDEXED_CHAINS = ["l1", "bitnames", "thunder"];

function apiUrl(path) {
  return `${API_BASE.replace(/\/+$/, "")}${path}`;
}

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value) {
  return typeof value === "string";
}

function describeValue(value) {
  if (Array.isArray(value)) return "array";
  if (value == null) return String(value);
  return typeof value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertOptionalNumberOrNull(value, fieldName) {
  assert(
    value == null || isFiniteNumber(value),
    `${fieldName} must be a finite number or null; received ${describeValue(value)}`,
  );
}

function assertBlockShape(block, chainId, index) {
  assert(isObject(block), `blocks[${index}] must be an object`);

  assert(
    block.chainId === chainId,
    `blocks[${index}].chainId must be ${chainId}; received ${String(block.chainId)}`,
  );
  assert(
    isFiniteNumber(block.height),
    `blocks[${index}].height must be a finite number; received ${describeValue(block.height)}`,
  );
  assert(
    isString(block.hash) && block.hash.length > 0,
    `blocks[${index}].hash must be a non-empty string`,
  );
  assert(
    isFiniteNumber(block.timestamp) ||
      (isString(block.timestamp) && block.timestamp.length > 0),
    `blocks[${index}].timestamp must be a number or non-empty string; received ${describeValue(block.timestamp)}`,
  );
  assert(
    isFiniteNumber(block.transactionCount),
    `blocks[${index}].transactionCount must be a finite number; received ${describeValue(block.transactionCount)}`,
  );

  assertOptionalNumberOrNull(block.size, `blocks[${index}].size`);
  assertOptionalNumberOrNull(block.weight, `blocks[${index}].weight`);
  assertOptionalNumberOrNull(block.confirmations, `blocks[${index}].confirmations`);

  if (block.previousHash != null) {
    assert(
      isString(block.previousHash),
      `blocks[${index}].previousHash must be a string or null; received ${describeValue(block.previousHash)}`,
    );
  }

  if (block.upstreamChainId != null) {
    assert(
      isString(block.upstreamChainId),
      `blocks[${index}].upstreamChainId must be a string or null; received ${describeValue(block.upstreamChainId)}`,
    );
  }
}

async function fetchJson(path) {
  const url = apiUrl(path);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(
      `${url} returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `${url} returned HTTP ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return {
    url,
    body,
  };
}

async function smokeBlocksEndpoint(chainId) {
  const { url, body } = await fetchJson(
    `/chains/${encodeURIComponent(chainId)}/blocks?limit=1`,
  );

  assert(isObject(body), `${url} response must be an object`);
  assert(
    body.chainId === chainId,
    `${url} chainId must be ${chainId}; received ${String(body.chainId)}`,
  );
  assert(
    Array.isArray(body.blocks),
    `${url} blocks must be an array; received ${describeValue(body.blocks)}`,
  );

  if (body.upstreamChainId != null) {
    assert(
      isString(body.upstreamChainId),
      `${url} upstreamChainId must be a string or null; received ${describeValue(body.upstreamChainId)}`,
    );
  }

  if (body.tipHeight != null) {
    assert(
      isFiniteNumber(body.tipHeight),
      `${url} tipHeight must be a finite number or null; received ${describeValue(body.tipHeight)}`,
    );
  }

  for (const [index, block] of body.blocks.entries()) {
    assertBlockShape(block, chainId, index);
  }

  return {
    chainId,
    url,
    blockCount: body.blocks.length,
    tipHeight: body.tipHeight ?? null,
    firstHeight: body.blocks[0]?.height ?? null,
  };
}

async function main() {
  console.log("SidΞcoin Explorer API smoke check");
  console.log(`API base: ${API_BASE}`);
  console.log(`Indexed chains: ${INDEXED_CHAINS.join(", ")}`);
  console.log("");

  const results = [];

  for (const chainId of INDEXED_CHAINS) {
    process.stdout.write(`Checking ${chainId} blocks endpoint... `);

    const result = await smokeBlocksEndpoint(chainId);
    results.push(result);

    console.log(
      `ok (${result.blockCount} block${result.blockCount === 1 ? "" : "s"})`,
    );
  }

  console.log("");
  console.log("Summary:");

  for (const result of results) {
    console.log(
      `- ${result.chainId}: tipHeight=${String(
        result.tipHeight,
      )}, firstHeight=${String(result.firstHeight)}`,
    );
  }

  console.log("");
  console.log("Explorer API smoke check passed.");
}

main().catch((error) => {
  console.error("");
  console.error("Explorer API smoke check failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
