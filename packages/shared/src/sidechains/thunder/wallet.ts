// packages/shared/src/sidechains/thunder/wallet.ts
//
// Thunder thin-client wallet operations: transaction building and
// authorization. The flow (agreed with the Thunder dev; node side shipped
// in thunder-rust 0.17, unchanged since):
//
//   1. derive addresses locally,
//   2. fetch UTXOs for those addresses from the backend (public data only),
//   3. select coins + build the transaction locally,
//   4. sign locally — one FROST-ristretto255 Authorization per input, over
//      the whole-tx canonical Borsh bytes,
//   5. submit; the node regenerates the utreexo proof.
//
// The seed never leaves the device; the node is a UTXO source + relay.
//
// Authorization rule (thunder-rust types/authorization.rs::authorize):
// for each input, the signing key's verifying key must satisfy
// BLAKE3(vk)[..20] == the SPENT OUTPUT's address — WrongKeyForAddress
// otherwise. Exactly one Authorization per input
// (NotEnoughAuthorizations / TooManyAuthorizations otherwise).

import {
  contentValueSats,
  pointedOutputHash,
  transactionBorshBytes,
  type ThunderPointedOutput,
  type ThunderTransaction,
  type ThunderOutput,
} from "./transaction";
import { frostSign } from "./frost";
import { baseMul } from "./crypto";
import { thunderAddressBytes } from "./address";
import { toHex, type ThunderAuthorizationJson } from "./wire";

/**
 * Build an unsigned Thunder transaction from selected UTXOs and outputs.
 * Each input carries the spent UTXO's consensus hash
 * BLAKE3(borsh(PointedOutput)) — the utreexo leaf the node proves against.
 */
export function buildThunderTransaction(
  utxos: ThunderPointedOutput[],
  outputs: ThunderOutput[],
): ThunderTransaction {
  return {
    inputs: utxos.map((utxo) => ({
      outPoint: utxo.outPoint,
      utxoHash: pointedOutputHash(utxo),
    })),
    outputs,
  };
}

/**
 * Authorize (sign) a built transaction: one FROST signature per input.
 * `secrets` must align 1:1 with `tx.inputs`, and `spentAddresses` must carry
 * each input's SPENT OUTPUT address (the caller holds the PointedOutputs it
 * selected). Verifies the thunder address rule per input:
 * BLAKE3(pubkey)[..20] == spent address.
 */
export function authorizeThunderTransaction(
  tx: ThunderTransaction,
  spentAddresses: Uint8Array[],
  secrets: bigint[],
): ThunderAuthorizationJson[] {
  if (tx.inputs.length !== spentAddresses.length || tx.inputs.length !== secrets.length) {
    throw new Error(
      `authorizeThunderTransaction: ${tx.inputs.length} inputs, ` +
        `${spentAddresses.length} spent addresses, ${secrets.length} secrets — must align 1:1`,
    );
  }
  const message = transactionBorshBytes(tx);
  const authorizations: ThunderAuthorizationJson[] = [];
  for (let i = 0; i < tx.inputs.length; i++) {
    const secret = secrets[i];
    const publicKey = baseMul(secret);
    const derivedAddress = thunderAddressBytes(publicKey);
    const spentAddress = spentAddresses[i];
    if (spentAddress.length !== 20 || derivedAddress.length !== 20) {
      throw new Error("authorizeThunderTransaction: addresses must be 20 bytes");
    }
    for (let b = 0; b < 20; b++) {
      if (derivedAddress[b] !== spentAddress[b]) {
        throw new Error(
          `authorizeThunderTransaction: wrong key for input ${i} — the key does not derive the address that owns this input`,
        );
      }
    }
    const signature = frostSign(message, secret);
    authorizations.push({
      verifying_key: toHex(publicKey),
      signature: toHex(signature),
    });
  }
  return authorizations;
}

/** Total value moved by a set of UTXOs, in sats. */
export function utxosValueSats(utxos: ThunderPointedOutput[]): bigint {
  return utxos.reduce((sum, u) => sum + contentValueSats(u.output.content), 0n);
}
