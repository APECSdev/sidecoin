#!/usr/bin/env node
/**
 * scripts/check-simpleanalytics.mjs
 *
 * Verifies that public Sidecoin portals include Simple Analytics.
 *
 * Usage:
 *   node scripts/check-simpleanalytics.mjs
 */

import { readFile } from "node:fs/promises";

const REQUIRED_SNIPPETS = [
  "https://scripts.simpleanalyticscdn.com/latest.js",
  "https://queue.simpleanalyticscdn.com/noscript.gif",
];

const PORTALS = [
  {
    name: "sidecoin.app",
    file: "packages/web/src/layouts/BaseLayout.astro",
  },
  {
    name: "wallet.sidecoin.app",
    file: "packages/wallet/index.html",
  },
  {
    name: "explorer.sidecoin.app",
    file: "packages/explorer/index.html",
  },
];

let failures = 0;

function pass(message) {
  console.log(`✅ ${message}`);
}

function fail(message, details) {
  failures += 1;
  console.error(`❌ ${message}`);
  if (details) {
    console.error(JSON.stringify(details, null, 2));
  }
}

async function checkPortal(portal) {
  let source;

  try {
    source = await readFile(portal.file, "utf8");
  } catch (e) {
    fail(`${portal.name} analytics source exists`, {
      file: portal.file,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  pass(`${portal.name} analytics source exists`);

  for (const snippet of REQUIRED_SNIPPETS) {
    if (source.includes(snippet)) {
      pass(`${portal.name} includes ${snippet}`);
    } else {
      fail(`${portal.name} includes ${snippet}`, {
        file: portal.file,
        snippet,
      });
    }
  }
}

async function main() {
  console.log("Sidecoin portal Simple Analytics audit");
  console.log("");

  for (const portal of PORTALS) {
    await checkPortal(portal);
  }

  console.log("");

  if (failures === 0) {
    console.log("✅ All public portals include Simple Analytics");
    process.exit(0);
  }

  console.error(`❌ ${failures} analytics audit failure(s)`);
  process.exit(1);
}

await main();
