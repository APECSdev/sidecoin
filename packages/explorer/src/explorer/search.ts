// packages/explorer/src/explorer/search.ts

import type { RouteLocationRaw } from "vue-router";
import type { ExplorerSearchResult } from "./types";

export type SearchClassification =
  | { kind: "empty"; query: "" }
  | { kind: "block"; query: string; id: string }
  | { kind: "transaction"; query: string; id: string }
  | { kind: "address"; query: string; id: string }
  | { kind: "unknown"; query: string; reason: string };

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const NON_NEGATIVE_INTEGER = /^(0|[1-9]\d*)$/;
const ADDRESS_LIKE = /^[a-zA-Z0-9:_\-.]{8,128}$/;

export function classifyExplorerSearch(query: string): SearchClassification {
  const trimmed = query.trim();

  if (!trimmed) {
    return { kind: "empty", query: "" };
  }

  if (NON_NEGATIVE_INTEGER.test(trimmed)) {
    return { kind: "block", query: trimmed, id: trimmed };
  }

  if (HEX_64.test(trimmed)) {
    return {
      kind: "transaction",
      query: trimmed,
      id: trimmed.toLowerCase(),
    };
  }

  if (ADDRESS_LIKE.test(trimmed)) {
    return { kind: "address", query: trimmed, id: trimmed };
  }

  return {
    kind: "unknown",
    query: trimmed,
    reason: "Enter a block height, 64-character transaction hash, or address.",
  };
}

export function routeForExplorerSearch(
  chainId: string,
  query: string,
): RouteLocationRaw | null {
  const result = classifyExplorerSearch(query);

  if (result.kind === "block") {
    return { name: "block", params: { chain: chainId, id: result.id } };
  }

  if (result.kind === "transaction") {
    return {
      name: "transaction",
      params: { chain: chainId, txid: result.id },
    };
  }

  if (result.kind === "address") {
    return { name: "address", params: { chain: chainId, address: result.id } };
  }

  return null;
}

export function searchResultFromClassification(
  chainId: string,
  query: string,
): ExplorerSearchResult {
  const result = classifyExplorerSearch(query);

  if (result.kind === "block") {
    return { type: "block", chainId, id: result.id };
  }

  if (result.kind === "transaction") {
    return { type: "transaction", chainId, id: result.id };
  }

  if (result.kind === "address") {
    return { type: "address", chainId, id: result.id };
  }

  return { type: "not_found", chainId, query: query.trim() };
}
