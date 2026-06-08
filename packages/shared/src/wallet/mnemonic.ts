// packages/shared/src/wallet/mnemonic.ts
//
// BIP-39 mnemonic generation / validation for the eCash (Sztorc drivechain
// fork) wallet. Bitcoin-derived chain — standard English wordlist, standard
// 128/256-bit entropy. Seed → key derivation lives in a separate module.

import {
  generateMnemonic as scureGenerate,
  validateMnemonic as scureValidate,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

/** 128 bits = 12 words, 256 bits = 24 words. */
export type MnemonicStrength = 128 | 256;

/**
 * Collapse whitespace, trim, lowercase. BIP-39 English words are lowercase;
 * this makes pasted/typed input forgiving without altering the checksum.
 */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Generate a fresh mnemonic using @scure/bip39's CSPRNG (webcrypto).
 * Defaults to 12 words.
 */
export function generateMnemonic(strength: MnemonicStrength = 128): string {
  return scureGenerate(wordlist, strength);
}

/** True only if the phrase is a valid BIP-39 mnemonic with a good checksum. */
export function validateMnemonic(mnemonic: string): boolean {
  return scureValidate(normalizeMnemonic(mnemonic), wordlist);
}
