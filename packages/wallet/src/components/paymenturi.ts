// packages/wallet/src/components/paymenturi.ts
//
// Pure parser for scanned payment QR payloads. Pulls a recipient address (and
// optional amount) out of either a bare address or a BIP-21 "bitcoin:" URI.
// No I/O, no validation of the address itself — just structural extraction —
// so it is trivially unit-testable and safe to call on untrusted scan input.

export interface ParsedPaymentUri {
  /** The recipient address (bare; "bitcoin:" scheme stripped if present). */
  address: string;
  /** Decimal coin amount from a BIP-21 ?amount=, when present and valid. */
  amount?: string;
}

/**
 * Parse a scanned value into { address, amount? }.
 *
 *   - Bare address ("tb1q…", "ecash:qq…") -> returned as the address verbatim.
 *   - BIP-21 "bitcoin:<addr>?amount=<btc>&…" -> scheme stripped, amount read.
 *
 * We strip ONLY the "bitcoin:" scheme: the bech32/legacy address that follows
 * is a bare string. Other schemes (notably cashaddr "ecash:") embed the prefix
 * in the canonical address, so those are kept verbatim. An amount is accepted
 * only when it is a clean non-negative decimal; anything else is ignored
 * rather than fabricated.
 */
export function parsePaymentUri(input: string): ParsedPaymentUri {
  const raw = input.trim();
  if (raw === "") return { address: "" };

  const qIndex = raw.indexOf("?");
  const beforeQuery = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const queryStr = qIndex === -1 ? "" : raw.slice(qIndex + 1);

  let address = beforeQuery;
  if (beforeQuery.toLowerCase().startsWith("bitcoin:")) {
    address = beforeQuery.slice("bitcoin:".length);
  }

  let amount: string | undefined;
  if (queryStr) {
    const params = new URLSearchParams(queryStr);
    const a = params.get("amount");
    if (a && /^\d+(\.\d+)?$/.test(a)) {
      amount = a;
    }
  }

  return amount !== undefined ? { address, amount } : { address };
}
