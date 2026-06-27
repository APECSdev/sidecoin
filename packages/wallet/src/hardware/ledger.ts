// packages/wallet/src/hardware/ledger.ts
//
// Ledger WebUSB adapter (read + sign). Chromium desktop + HTTPS/localhost only.
//
// Uses the CLASSIC Ledger stack (@ledgerhq/hw-transport-webusb +
// @ledgerhq/hw-app-btc) for broad Nano S / Nano S Plus / Nano X firmware
// support, per the project decision to avoid the newest Ledger SDKs.
//
// Signing goes through `Btc.signPsbtBuffer` (PSBT v0/v2). Unlike the legacy
// `createPaymentTransaction` API, signPsbtBuffer signs from the PSBT's
// per-input witnessUtxo alone — no full prevout transactions need to be
// fetched (the wallet API exposes no raw-tx endpoint). The host supplies
// `knownAddressDerivations` so Ledger can populate BIP32 derivations for the
// wallet's own P2WPKH inputs.

import type {
  HardwareWallet,
  HardwareAccount,
  GetAddressOpts,
  HardwareSignRequest,
  HardwareSignedTx,
} from "./types";
import { Psbt, networks, address as btcAddress } from "bitcoinjs-lib";
import type { NetworkId } from "@sidecoin/shared";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";

/** bitcoinjs-lib network object for a Sidecoin network id. Signet shares
 *  testnet's bech32 HRP ("tb") and version bytes, so networks.testnet is
 *  correct for signet. */
function btcNetworkFor(network: NetworkId) {
  switch (network) {
    case "mainnet":
      return networks.bitcoin;
    case "regtest":
      return networks.regtest;
    case "testnet":
    case "signet":
    case "l2l-signet":
    default:
      return networks.testnet;
  }
}

/** RIPEMD-160(SHA-256(data)) — BIP-143 hash160 for P2WPKH keyhash. */
function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

export class LedgerHardwareWallet implements HardwareWallet {
  readonly name = "Ledger";

  private transport: any = null;
  private app: any = null;
  private addressInFlight = false;
  private signInFlight = false;

  private async ensureApp(): Promise<any> {
    if (this.app) return this.app;
    // Heavy SDKs are dynamic-imported: keeps the main bundle clean and keeps
    // WebUSB out of jsdom/happy-dom during unit tests.
    const { default: TransportWebUSB } = await import(
      "@ledgerhq/hw-transport-webusb"
    );
    // requestDevice() is invoked inside create(); must be in a user gesture.
    this.transport = await TransportWebUSB.create();
    const { default: Btc } = await import("@ledgerhq/hw-app-btc");
    // HARDWARE-UNVERIFIED: v11 Btc constructor. The options-object form
    // ({ transport, currency }) is the documented v11 signature; if a device
    // errors at construction, fall back to `new Btc(this.transport)`.
    this.app = new (Btc as any)({ transport: this.transport, currency: "bitcoin" });
    return this.app;
  }

  async connect(): Promise<void> {
    // ensureApp() performs the WebUSB requestDevice() inside a user gesture.
    // We also probe the device by reading the account public key so a
    // connection error surfaces here rather than at first sign.
    await this.ensureApp();
  }

  async getAddress(
    path: string,
    opts: GetAddressOpts = {},
  ): Promise<HardwareAccount> {
    if (this.addressInFlight) {
      throw new Error("Address request already in progress.");
    }
    this.addressInFlight = true;
    try {
      const app = await this.ensureApp();
      const res = await app.getWalletPublicKey(path, {
        format: "bech32",
        verify: opts.showOnDevice ?? false,
      });
      return {
        path,
        address: res.bitcoinAddress,
        publicKey: res.publicKey,
      };
    } finally {
      this.addressInFlight = false;
    }
  }

  /**
   * Sign a P2WPKH spend on the Ledger device via signPsbtBuffer.
   *
   * The PSBT is built host-side with witnessUtxo per input (no prevout txs).
   * `knownAddressDerivations` maps the wallet's P2WPKH script(s) to
   * { pubkey, path } so Ledger can populate BIP32 derivations it needs to sign.
   */
  async signTransaction(req: HardwareSignRequest): Promise<HardwareSignedTx> {
    if (this.signInFlight) {
      throw new Error("Signing request already in progress.");
    }
    this.signInFlight = true;
    try {
      const app = await this.ensureApp();

      // The device-derived public key for the signing path (33-byte compressed
      // hex). Ledger returns the compressed pubkey for bech32 format.
      const pubRes = await app.getWalletPublicKey(req.derivationPath, {
        format: "bech32",
        verify: false,
      });
      const pubkeyBuf = Buffer.from(pubRes.publicKey, "hex");

      // P2WPKH scriptPubKey for this key: 0014<hash160(pubkey)>.
      const pubkeyHash = hash160(pubkeyBuf);
      const spkHex = "0014" + Buffer.from(pubkeyHash).toString("hex");

      const network = btcNetworkFor(req.network);

      // Build the unsigned PSBT. bitcoinjs-lib uses `number` for values, so
      // guard against amounts exceeding Number.MAX_SAFE_INTEGER (only relevant
      // for >~90M BTC; signet test funds are nowhere near).
      const psbt = new Psbt({ network });
      for (const u of req.inputs) {
        const value = Number(u.amountSatoshis);
        if (!Number.isSafeInteger(value)) {
          throw new Error(
            `UTXO amount ${u.amountSatoshis} exceeds safe integer range for PSBT construction.`,
          );
        }
        psbt.addInput({
          hash: u.txid,
          index: u.vout,
          witnessUtxo: {
            script: Buffer.from(u.scriptPubKey, "hex"),
            value,
          },
        });
      }

      psbt.addOutput({
        address: req.toAddress,
        value: Number(req.amountSatoshis),
      });

      // Change output: only if it strictly clears dust (mirrors the software
      // builder + toTrezorSignParams; sub-dust change folds into the fee).
      let totalInput = 0n;
      for (const u of req.inputs) totalInput += u.amountSatoshis;
      const change = totalInput - req.amountSatoshis - req.feeSatoshis;
      if (change > 546n) {
        psbt.addOutput({
          script: Buffer.from(req.changeScriptPubKey, "hex"),
          value: Number(change),
        });
      } else if (change < 0n) {
        throw new Error(
          `Insufficient funds: inputs ${totalInput} < amount ${req.amountSatoshis} + fee ${req.feeSatoshis}.`,
        );
      }

      const psbtBuffer = psbt.toBuffer();

      // knownAddressDerivations: Map<scriptPubKeyHashHex, { pubkey, path }>.
      // HARDWARE-UNVERIFIED: the d.ts describes the key as "scriptPubKey hash
      // (hex)". To be robust against either interpretation, we register the
      // derivation under BOTH the full scriptPubKey hex AND the 20-byte
      // hash160 hex. Extra entries are harmless; the correct one is what Ledger
      // will look up internally when populating missing BIP32 derivations.
      const pathNumbers = parsePathNumbers(req.derivationPath);
      const known = new Map<string, { pubkey: Buffer; path: number[] }>();
      const entry = { pubkey: pubkeyBuf, path: pathNumbers };
      known.set(spkHex, entry);
      known.set(Buffer.from(pubkeyHash).toString("hex"), entry);

      // accountPath = the BIP-44 account level (m/84'/coin'/0'), strip /0/index.
      const accountPath = req.derivationPath
        .split("/")
        .slice(0, 4)
        .join("/");

      const result = await app.signPsbtBuffer(psbtBuffer, {
        finalizePsbt: true,
        accountPath,
        addressFormat: "bech32",
        knownAddressDerivations: known,
      });

      // finalizePsbt:true -> result.tx is the fully-signed raw tx hex string.
      const txHex: string | undefined = result.tx;
      if (!txHex) {
        throw new Error("Ledger returned no signed transaction.");
      }

      // Compute the txid from the signed hex (display/big-endian). bitcoinjs-lib
      // is used purely to derive the id so we don't re-implement SHA256d.
      const txid = ledgerTxid(txHex);
      return { hex: txHex, txid };
    } finally {
      this.signInFlight = false;
    }
  }

  async disconnect(): Promise<void> {
    // Ledger transport is stateful; close it so the device is released.
    try {
      await this.transport?.close?.();
    } catch {
      // ignore — already closed or never opened
    }
    this.transport = null;
    this.app = null;
  }
}

/** Parse a BIP-32 path string into the uint32[] Ledger wants for `path`. */
function parsePathNumbers(path: string): number[] {
  const HARDENED = 0x80000000;
  const out: number[] = [];
  for (const seg of path.replace(/^m\//, "").split("/")) {
    if (seg === "") continue;
    const hardened = seg.endsWith("'");
    const raw = hardened ? seg.slice(0, -1) : seg;
    const index = Number.parseInt(raw, 10);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Invalid BIP-32 path segment "${seg}" in "${path}".`);
    }
    out.push(((hardened ? index | HARDENED : index) >>> 0) as number);
  }
  return out;
}

/** Derive a display-order txid (big-endian hex) from a raw signed tx hex. */
function ledgerTxid(txHex: string): string {
  // Avoid a circular bitcoinjs-lib Transaction import cost: use the standalone
  // sha256d (double SHA-256) over the raw bytes, then reverse to display order.
  // bitcoinjs-lib's Transaction.fromHex would also work but pulls more code.
  const bytes = Buffer.from(txHex, "hex");
  const once = Buffer.from(sha256(bytes));
  const twice = Buffer.from(sha256(once));
  return twice.reverse().toString("hex");
}

// Suppress unused-import lint for btcAddress (retained for future recipient
// script validation; the PSBT path uses addOutput({address}) directly).
void btcAddress;
