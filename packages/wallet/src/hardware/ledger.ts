// packages/wallet/src/hardware/ledger.ts
//
// Ledger hardware wallet adapter (read + sign). Chromium desktop + HTTPS/localhost only.
//
// Transport: WebHID is used when available (Chrome/Edge). WebHID is the same
// transport Ledger Live uses, and the new Bitcoin app (app-bitcoin-new,
// CLA 0xE1) only responds on the HID interface — NOT the WebUSB bulk
// transfer interface. WebUSB is kept as a fallback only for browsers
// without WebHID support (e.g. Firefox).
//
// IMPORTANT: Ledger Live desktop must be CLOSED before connecting. It holds
// exclusive access to the HID interface and will prevent the browser from
// opening the device.
//
// REQUIRED DEVICE APP: "Bitcoin Test" (NOT "Bitcoin") for testnet/signet.
// Install via Ledger Live → Settings → Experimental features → Developer mode.
// The mainnet Bitcoin app rejects testnet paths with 0x6a82/0x6a80.
//
// ARCHITECTURE: AppClient (low-level APDU wrapper) is used directly rather
// than the SDK's BtcNew/Btc wrapper because BtcNew.getWalletPublicKey calls
// bip32.getXpubComponents → bs58check → create-hash → Node.js stream/util,
// which Vite externalizes and breaks in the browser. AppClient does not
// depend on bs58check. All xpub parsing and BIP-32 CKDpub derivation is
// handled locally using @noble/curves and @noble/hashes.
//
// SIGNING: PSBTs are built with bitcoinjs-lib, bip32Derivation is injected
// on every input and the change output, then signed via AppClient.signPsbt
// with a default wallet policy (wpkh(@0/**), null HMAC). nonWitnessUtxo is
// included when available to suppress the "Unverified inputs" device warning.

import type {
  HardwareWallet,
  HardwareAccount,
  GetAddressOpts,
  HardwareSignRequest,
  HardwareSignedTx,
} from "./types";
import { Psbt, networks, address as btcAddress, payments } from "bitcoinjs-lib";
import type { NetworkId } from "@sidecoin/shared";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha2";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { PsbtV2, psbtIn } from "@ledgerhq/psbtv2";

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

/** Compress an uncompressed secp256k1 public key (65 bytes, 0x04 prefix)
 *  to compressed form (33 bytes, 0x02/0x03 prefix). If the key is already
 *  compressed (33 bytes), returns it unchanged. */
function compressPubkey(pubkey: Buffer): Buffer {
  if (pubkey.length === 33) return pubkey;
  if (pubkey.length !== 65 || pubkey[0] !== 0x04) {
    throw new Error(
      `Invalid public key: expected 33 or 65 bytes, got ${pubkey.length} bytes with prefix 0x${pubkey[0]?.toString(16) ?? "none"}`,
    );
  }
  const x = pubkey.subarray(1, 33);
  const yLastByte = pubkey[64];
  const prefix = (yLastByte & 1) === 0 ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), x]);
}

// ── Base58check (local implementation, no CJS dependencies) ──

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58checkDecode(str: string): Buffer {
  const bytes: number[] = [];
  for (const c of str) {
    const value = BASE58_ALPHABET.indexOf(c);
    if (value === -1) {
      throw new Error(`Invalid base58 character: "${c}"`);
    }
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const c of str) {
    if (c !== "1") break;
    bytes.push(0);
  }
  const decoded = Buffer.from(bytes.reverse());

  const payload = decoded.subarray(0, -4);
  const checksum = decoded.subarray(-4);
  const hashOnce = Buffer.from(sha256(payload));
  const hashTwice = Buffer.from(sha256(hashOnce));
  if (!hashTwice.subarray(0, 4).equals(checksum)) {
    throw new Error("Invalid base58check checksum");
  }
  return payload;
}

/** Encode a Buffer payload as base58check. */
function base58checkEncode(payload: Buffer): string {
  const hashOnce = Buffer.from(sha256(payload));
  const hashTwice = Buffer.from(sha256(hashOnce));
  const checksum = hashTwice.subarray(0, 4);

  const data = Buffer.concat([payload, checksum]);

  let num = 0n;
  for (const byte of data) {
    num = num * 256n + BigInt(byte);
  }

  let result = "";
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    result = BASE58_ALPHABET[remainder] + result;
  }

  for (const byte of data) {
    if (byte === 0) {
      result = "1" + result;
    } else {
      break;
    }
  }

  return result;
}

// ── BIP-32 CKDpub (local implementation using @noble/curves + @noble/hashes) ──

/** Decode an xpub string into its components: chaincode (32 bytes),
 *  pubkey (33 bytes), and version (4 bytes). */
function getXpubComponents(xpub: string): {
  chaincode: Buffer;
  pubkey: Buffer;
  version: number;
} {
  const buf = base58checkDecode(xpub);
  return {
    version: buf.readUInt32BE(0),
    chaincode: buf.subarray(13, 13 + 32),
    pubkey: buf.subarray(buf.length - 33),
  };
}

/** Derive a child public key from a parent public key using BIP-32
 *  non-hardened derivation (CKDpub). Returns the child pubkey (33 bytes
 *  compressed) and child chaincode (32 bytes). */
function deriveChildPublicKey(
  parentPubkey: Buffer,
  parentChaincode: Buffer,
  index: number,
): { pubkey: Buffer; chaincode: Buffer } {
  if (parentPubkey.length !== 33) {
    throw new Error(
      `Invalid parent pubkey length: expected 33 bytes, got ${parentPubkey.length}`,
    );
  }
  if (parentChaincode.length !== 32) {
    throw new Error(
      `Invalid parent chaincode length: expected 32 bytes, got ${parentChaincode.length}`,
    );
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid index: must be a non-negative integer, got ${index}`);
  }
  if (index >= 0x80000000) {
    throw new Error("Cannot derive hardened child from public key");
  }

  const data = Buffer.alloc(parentPubkey.length + 4);
  parentPubkey.copy(data, 0);
  data.writeUInt32BE(index, parentPubkey.length);
  const I = Buffer.from(hmac(sha512, parentChaincode, data));
  const IL = I.subarray(0, 32);
  const IR = I.subarray(32);

  const tweak = BigInt(`0x${IL.toString("hex")}`);
  const curveOrder =
    0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

  if (tweak === 0n || tweak >= curveOrder) {
    throw new Error(`Invalid child derivation at index ${index}`);
  }

  const parentPoint = secp256k1.Point.fromHex(parentPubkey.toString("hex"));
  const tweakPoint = secp256k1.Point.BASE.multiply(tweak);
  const childPoint = parentPoint.add(tweakPoint);

  if (childPoint.is0?.() ?? false) {
    throw new Error(`Invalid child derivation at index ${index}`);
  }

  return {
    pubkey: Buffer.from(childPoint.toBytes(true)),
    chaincode: Buffer.from(IR),
  };
}

/** Check whether an error from the Ledger SDK indicates a protocol
 *  incompatibility, signalling fallback to legacy BtcOld protocol.
 *  0x6a82 and 0x6a80 are EXCLUDED — they indicate data/path issues,
 *  not protocol mismatch. */
function isLegacyFallback(e: unknown): boolean {
  if (e && typeof e === "object" && "statusCode" in e) {
    const statusCode = (e as any).statusCode;
    return (
      statusCode === 0x6a81 ||
      statusCode === 0x6a84 ||
      statusCode === 0x6a86 ||
      statusCode === 0x6d00 ||
      statusCode === 0x6e00
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /0x6a(81|84|86)\b|0x6d00|0x6e00/i.test(msg);
}

/** Encode a Bitcoin varint (CompactSize) as a Buffer. */
function encodeVarint(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) return Buffer.from([0xfd, n & 0xff, (n >> 8) & 0xff]);
  return Buffer.from([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

/** Build the serialized output script hex (varint count + outputs) that
 *  BtcOld.createPaymentTransaction expects for the outputScriptHex parameter. */
function buildOutputScriptHex(outputs: { value: bigint; script: Uint8Array }[]): string {
  const parts: Buffer[] = [encodeVarint(outputs.length)];
  for (const out of outputs) {
    const valueBuf = Buffer.alloc(8);
    valueBuf.writeBigUInt64LE(out.value);
    parts.push(valueBuf);
    parts.push(encodeVarint(out.script.length));
    parts.push(Buffer.from(out.script));
  }
  return Buffer.concat(parts).toString("hex");
}

/** Convert a BIP-32 path element array to a display string like "m/84'/1'/0'". */
function pathArrayToString(elements: number[]): string {
  const HARDENED = 0x80000000;
  return (
    "m/" +
    elements
      .map((n) => {
        const hardened = n >= HARDENED;
        const index = hardened ? n - HARDENED : n;
        return hardened ? `${index}'` : `${index}`;
      })
      .join("/")
  );
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

/** Encode a BIP-32 path (array of uint32) into the Ledger wire format:
 *  1 byte count + 4 bytes per element (big-endian). */
function pathElementsToBuffer(elements: number[]): Buffer {
  const buf = Buffer.alloc(1 + elements.length * 4);
  buf[0] = elements.length;
  for (let i = 0; i < elements.length; i++) {
    buf.writeUInt32BE(elements[i] >>> 0, 1 + i * 4);
  }
  return buf;
}

/** Derive a display-order txid (big-endian hex) from a raw signed tx hex. */
function ledgerTxid(txHex: string): string {
  const bytes = Buffer.from(txHex, "hex");
  const once = Buffer.from(sha256(bytes));
  const twice = Buffer.from(sha256(once));
  return twice.reverse().toString("hex");
}

/** Derive the change-level + address-level pubkey from an account xpub.
 *  Performs 2 levels of non-hardened CKDpub: account → change → address. */
function deriveAddressKey(
  accountXpub: string,
  changeIndex: number,
  addressIndex: number,
): { pubkey: Buffer; chaincode: Buffer } {
  const components = getXpubComponents(accountXpub);
  const changeKey = deriveChildPublicKey(
    components.pubkey,
    components.chaincode,
    changeIndex,
  );
  return deriveChildPublicKey(
    changeKey.pubkey,
    changeKey.chaincode,
    addressIndex,
  );
}

/** BIP-32 testnet public version bytes (tpub). */
const TESTNET_BIP32_PUBLIC = 0x043587cf;

/** Convert an xpub from mainnet version bytes to testnet version bytes.
 *  If the xpub is already in testnet format, returns it as-is. */
function convertXpubToTestnet(xpub: string): string {
  const buf = base58checkDecode(xpub);
  const currentVersion = buf.readUInt32BE(0);
  if (currentVersion !== 0x0488b21e) {
    return xpub;
  }
  buf.writeUInt32BE(TESTNET_BIP32_PUBLIC, 0);
  return base58checkEncode(buf);
}

export class LedgerHardwareWallet implements HardwareWallet {
  readonly name = "Ledger";

  private transport: any = null;
  private app: any = null;
  private addressInFlight = false;
  private signInFlight = false;
  private useLegacy = false;

  private xpubCache: Map<string, string> = new Map();
  private masterFp: Buffer | null = null;

  private async ensureApp(): Promise<any> {
    if (this.app) return this.app;

    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // ignore — already closed
      }
      this.transport = null;
    }

    // ── Transport selection ──
    if (typeof navigator !== "undefined" && "hid" in navigator) {
      const { default: TransportWebHID } = await import(
        "@ledgerhq/hw-transport-webhid"
      );
      try {
        this.transport = await TransportWebHID.create();
      } catch (hidErr: any) {
        const msg = hidErr?.message ?? String(hidErr);
        if (/already open/i.test(msg)) {
          try {
            const devices = await (navigator as any).hid?.getDevices?.();
            if (devices) {
              for (const d of devices) {
                try { await d.close(); } catch {}
              }
            }
          } catch {}
          try {
            this.transport = await TransportWebHID.create();
          } catch (retryErr: any) {
            throw new Error(
              "Could not open the Ledger device via WebHID.\n\n" +
                "The device reports it is already open. This can happen if:\n" +
                "• Ledger Live is running (quit the app completely)\n" +
                "• Another browser tab is using the device\n" +
                "• A previous session didn't release the connection\n\n" +
                "Please:\n" +
                "1. CLOSE Ledger Live completely (quit, don't minimize)\n" +
                "2. Close other browser tabs that may use the device\n" +
                "3. Disconnect and reconnect your Ledger\n" +
                "4. Refresh this page and click Connect again",
            );
          }
        } else if (/Failed to open|busy|unable|access/i.test(msg)) {
          throw new Error(
            "Could not open the Ledger device via WebHID.\n\n" +
              "This usually means Ledger Live is running and holding the " +
              "device. Please:\n" +
              "1. CLOSE Ledger Live completely (quit the app, don't just " +
              "minimize it)\n" +
              "2. Disconnect and reconnect your Ledger device\n" +
              "3. Click Connect again\n\n" +
              "Ledger Live holds exclusive access to the HID interface.",
          );
        }
        throw hidErr;
      }
    } else {
      const { default: TransportWebUSB } = await import(
        "@ledgerhq/hw-transport-webusb"
      );
      this.transport = await TransportWebUSB.create();
    }

    // ── Identify device app ──
    try {
      const { getAppAndVersion } = await import(
        "@ledgerhq/hw-app-btc/lib/getAppAndVersion.js"
      );
      const info = await getAppAndVersion(this.transport);
      console.log(
        `[Ledger] Connected to "${info.name}" v${info.version}`,
      );
    } catch (diagErr) {
      console.error("[Ledger] Failed to read app version:", diagErr);
    }

    const { AppClient } = await import(
      "@ledgerhq/hw-app-btc/lib/newops/appClient"
    );
    this.app = new AppClient(this.transport);
    return this.app;
  }

  /** Switch from new protocol to BtcOld (legacy protocol) after
   *  detecting that the device has the old Bitcoin app. */
  private async switchToLegacy(): Promise<void> {
    this.useLegacy = true;
    const { default: BtcOld } = await import("@ledgerhq/hw-app-btc/lib/BtcOld");
    this.app = new (BtcOld as any)(this.transport);
  }

  async connect(): Promise<void> {
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
      const verify = opts.showOnDevice ?? false;

      // ── Primary path: AppClient.getExtendedPubkey + local derivation ──
      try {
        const pathElements = parsePathNumbers(path);
        const accountPath = pathElements.slice(0, 3);
        const accountPathStr = pathArrayToString(accountPath);

        let accountXpub = this.xpubCache.get(accountPathStr);
        if (!accountXpub) {
          accountXpub = await app.getExtendedPubkey(false, accountPath);
          this.xpubCache.set(accountPathStr, accountXpub!);
        }

        const changeAndIndex = pathElements.slice(-2);
        const change = changeAndIndex[0] ?? 0;
        const addressIndex = changeAndIndex[1] ?? 0;

        const finalKey = deriveAddressKey(accountXpub!, change, addressIndex);
        const pubkeyBuf = compressPubkey(Buffer.from(finalKey.pubkey));
        const publicKeyHex = pubkeyBuf.toString("hex");

        const network = btcNetworkFor((opts as any).network ?? "signet");
        const p2wpkh = payments.p2wpkh({ pubkey: pubkeyBuf, network });
        const address = p2wpkh.address!;

        if (verify) {
          const { WalletPolicy, createKey } = await import(
            "@ledgerhq/hw-app-btc/lib/newops/policy"
          );
          if (!this.masterFp) {
            this.masterFp = await app.getMasterFingerprint();
          }
          const networkXpub = convertXpubToTestnet(accountXpub!);
          const keyStr = createKey(this.masterFp!, accountPath, networkXpub);
          const policy = new WalletPolicy("wpkh(@0/**)", keyStr);
          await app.getWalletAddress(
            policy, null, change, addressIndex, true,
          );
        }

        return {
          path,
          address,
          publicKey: publicKeyHex,
        };
      } catch (e: any) {
        // ── Raw APDU fallback ──
        if (!this.useLegacy) {
          try {
            const account = await this.getAddressDirect(path, verify, opts);
            if (account) return account;
          } catch {
            // swallow — try legacy next
          }
        }

        // ── Legacy protocol fallback ──
        if (!this.useLegacy && isLegacyFallback(e)) {
          await this.switchToLegacy();

          try {
            const resLegacy = await this.app.getWalletPublicKey(path, {
              format: "legacy",
              verify: false,
            });

            try {
              const resBech32 = await this.app.getWalletPublicKey(path, {
                format: "bech32",
                verify,
              });
              return {
                path,
                address: resBech32.bitcoinAddress,
                publicKey: resBech32.publicKey,
              };
            } catch {
              const pubkeyBuf = Buffer.from(resLegacy.publicKey, "hex");
              const network = btcNetworkFor((opts as any).network ?? "signet");
              const p2wpkh = payments.p2wpkh({ pubkey: pubkeyBuf, network });
              return {
                path,
                address: p2wpkh.address!,
                publicKey: resLegacy.publicKey,
              };
            }
          } catch (e3: any) {
            console.error("[Ledger] Legacy signing failed:", e3?.message ?? String(e3));
            throw e3;
          }
        }

        throw e;
      }
    } finally {
      this.addressInFlight = false;
    }
  }

  /**
   * Raw APDU fallback for address derivation. Sends GET_PUBKEY with
   * display=true via the transport directly, then derives locally. */
  private async getAddressDirect(
    path: string,
    _verify: boolean,
    opts: GetAddressOpts,
  ): Promise<HardwareAccount | null> {
    const pathElements = parsePathNumbers(path);
    const accountPath = pathElements.slice(0, 3);
    const accountPathStr = pathArrayToString(accountPath);

    let accountXpub = this.xpubCache.get(accountPathStr);
    if (!accountXpub) {
      const data = Buffer.concat([
        Buffer.from([1]), // display=true
        pathElementsToBuffer(accountPath),
      ]);
      const response = await this.transport.send(
        0xE1, 0x00, 0x00, 0x01, data, [0x9000, 0xe000]
      );
      accountXpub = response.slice(0, -2).toString("ascii");
      this.xpubCache.set(accountPathStr, accountXpub!);
    }

    const changeAndIndex = pathElements.slice(-2);
    const change = changeAndIndex[0] ?? 0;
    const addressIndex = changeAndIndex[1] ?? 0;

    const finalKey = deriveAddressKey(accountXpub!, change, addressIndex);
    const pubkeyBuf = compressPubkey(Buffer.from(finalKey.pubkey));
    const publicKeyHex = pubkeyBuf.toString("hex");

    const network = btcNetworkFor((opts as any).network ?? "signet");
    const p2wpkh = payments.p2wpkh({ pubkey: pubkeyBuf, network });
    const address = p2wpkh.address!;

    return { path, address, publicKey: publicKeyHex };
  }

  async signTransaction(req: HardwareSignRequest): Promise<HardwareSignedTx> {
    if (this.signInFlight) {
      throw new Error("Signing request already in progress.");
    }
    this.signInFlight = true;
    try {
      if (this.useLegacy) {
        return await this.signLegacy(req);
      }
      try {
        return await this.signPsbt(req);
      } catch (e) {
        if (isLegacyFallback(e)) {
          await this.switchToLegacy();
          return await this.signLegacy(req);
        }
        throw e;
      }
    } finally {
      this.signInFlight = false;
    }
  }

  /**
   * Sign a transaction via PSBT (AppClient.signPsbt).
   *
   * Builds a PSBT with bitcoinjs-lib, injects bip32Derivation on every
   * input and the change output, includes nonWitnessUtxo when available
   * (suppresses "Unverified inputs" device warning), then delegates to
   * signPsbtDirect which uses AppClient.signPsbt with the wallet policy. */
  private async signPsbt(req: HardwareSignRequest): Promise<HardwareSignedTx> {
    const app = await this.ensureApp();
    const pubkeyBuf = await this.derivePubkeyFromCache(req.derivationPath);

    const pubkeyHash = hash160(pubkeyBuf);
    const spkHex = "0014" + Buffer.from(pubkeyHash).toString("hex");
    const network = btcNetworkFor(req.network);

    // ── Build PSBT ──
    const psbt = new Psbt({ network });
    for (const u of req.inputs) {
      const rawTxHex = req.rawTxs?.[u.txid];
      const inputOpts: any = {
        hash: u.txid,
        index: u.vout,
        witnessUtxo: {
          script: Buffer.from(u.scriptPubKey, "hex"),
          value: u.amountSatoshis,
        },
      };
      if (rawTxHex) {
        inputOpts.nonWitnessUtxo = Buffer.from(rawTxHex, "hex");
      }
      psbt.addInput(inputOpts);
    }

    psbt.addOutput({ address: req.toAddress, value: req.amountSatoshis });

    let totalInput = 0n;
    for (const u of req.inputs) totalInput += u.amountSatoshis;
    const change = totalInput - req.amountSatoshis - req.feeSatoshis;
    if (change > 546n) {
      psbt.addOutput({
        script: Buffer.from(req.changeScriptPubKey, "hex"),
        value: change,
      });
    } else if (change < 0n) {
      throw new Error(
        `Insufficient funds: inputs ${totalInput} < amount ${req.amountSatoshis} + fee ${req.feeSatoshis}.`,
      );
    }

    const psbtBuffer = Buffer.from(psbt.toBuffer());

    const pathNumbers = parsePathNumbers(req.derivationPath);
    const known = new Map<string, { pubkey: Uint8Array; path: number[] }>();
    const entry = { pubkey: new Uint8Array(pubkeyBuf), path: pathNumbers };
    known.set(spkHex, entry);
    known.set(Buffer.from(pubkeyHash).toString("hex"), entry);

    const accountPath = req.derivationPath
      .split("/")
      .slice(0, 4)
      .join("/");

    // ── Try signPsbtBuffer if available (BtcNew), otherwise signPsbtDirect ──
    if (typeof app.signPsbtBuffer === 'function') {
      try {
        const result = await app.signPsbtBuffer(psbtBuffer, {
          finalizePsbt: true,
          accountPath,
          addressFormat: "bech32",
          knownAddressDerivations: known,
        });

        const txHex: string | undefined = result.tx;
        if (!txHex) {
          throw new Error("Ledger returned no signed transaction.");
        }
        return { hex: txHex, txid: ledgerTxid(txHex) };
      } catch {
        // fall through to signPsbtDirect
      }
    }

    return await this.signPsbtDirect(req, psbtBuffer);
  }

  /**
   * Sign via direct AppClient.signPsbt with wallet policy.
   *
   * Uses AppClient.signPsbt (appClient.js) with null HMAC (default wallet).
   * The device validates the wallet policy, requests PSBT data and wallet
   * policy data via client commands (0xe000), then yields signatures. */
  private async signPsbtDirect(
    req: HardwareSignRequest,
    psbtBuffer: Buffer,
  ): Promise<HardwareSignedTx> {
    const { AppClient } = await import(
      "@ledgerhq/hw-app-btc/lib/newops/appClient"
    );
    const { WalletPolicy, createKey } = await import(
      "@ledgerhq/hw-app-btc/lib/newops/policy"
    );
    const { hardenedPathOf } = await import("@ledgerhq/hw-app-btc/lib/bip32");
    const { finalize } = await import(
      "@ledgerhq/hw-app-btc/lib/newops/psbtFinalizer"
    );
    const { extract } = await import(
      "@ledgerhq/hw-app-btc/lib/newops/psbtExtractor"
    );

    const appClient = new AppClient(this.transport);
    const pathElements = parsePathNumbers(req.derivationPath);
    const accountPath = hardenedPathOf(pathElements);
    const accountPathStr = pathArrayToString(accountPath);

    let accountXpub = this.xpubCache.get(accountPathStr);
    if (!accountXpub) {
      try {
        accountXpub = await appClient.getExtendedPubkey(false, accountPath);
      } catch {
        const data = Buffer.concat([
          Buffer.from([1]),
          pathElementsToBuffer(accountPath),
        ]);
        const response = await this.transport.send(
          0xE1, 0x00, 0x00, 0x01, data, [0x9000, 0xe000]
        );
        accountXpub = response.slice(0, -2).toString("ascii");
      }
      this.xpubCache.set(accountPathStr, accountXpub!);
    }

    if (!this.masterFp) {
      this.masterFp = await appClient.getMasterFingerprint();
    }
    const masterFp = this.masterFp!;

    const networkXpub = convertXpubToTestnet(accountXpub!);
    const keyStr = createKey(masterFp, accountPath, networkXpub);

    const policy = new WalletPolicy("wpkh(@0/**)", keyStr);

    // ── Inject bip32Derivation on inputs ──
    const inputPubkey = await this.derivePubkeyFromCache(req.derivationPath);
    const network = btcNetworkFor(req.network);
    const psbtV0 = Psbt.fromBuffer(psbtBuffer, { network });

    for (let i = 0; i < psbtV0.data.inputs.length; i++) {
      psbtV0.updateInput(i, {
        bip32Derivation: [
          {
            masterFingerprint: masterFp,
            path: req.derivationPath,
            pubkey: inputPubkey,
          },
        ],
      });
    }

    // ── Convert to PsbtV2 and inject change output bip32Derivation ──
    const psbtV2 = PsbtV2.fromV0(Buffer.from(psbtV0.toBuffer()));

    for (let i = 0; i < psbtV2.getGlobalOutputCount(); i++) {
      let outScript: Buffer;
      try {
        outScript = psbtV2.getOutputScript(i);
      } catch {
        continue;
      }
      if (Buffer.isBuffer(outScript) && outScript.toString("hex") === req.changeScriptPubKey) {
        psbtV2.setOutputBip32Derivation(i, inputPubkey, masterFp, pathElements);
      }
    }

    // ── Sign ──
    const sigs = await appClient.signPsbt(psbtV2, policy, null, () => {});

    sigs.forEach((v: Buffer, k: number) => {
      const pubkeys = psbtV2.getInputKeyDatas(k, psbtIn.BIP32_DERIVATION);
      if (pubkeys.length != 1) {
        const tapPubkeys = psbtV2.getInputKeyDatas(
          k,
          psbtIn.TAP_BIP32_DERIVATION,
        );
        if (tapPubkeys.length == 0) {
          throw Error(`Missing pubkey derivation for input ${k}`);
        }
        psbtV2.setInputTapKeySig(k, v);
      } else {
        psbtV2.setInputPartialSig(k, pubkeys[0], v);
      }
    });

    finalize(psbtV2);
    const extracted = extract(psbtV2);
    const txHex = Buffer.isBuffer(extracted)
      ? extracted.toString("hex")
      : Buffer.from(extracted).toString("hex");

    if (!txHex) {
      throw new Error("Ledger returned no signed transaction.");
    }

    return { hex: txHex, txid: ledgerTxid(txHex) };
  }

  /**
   * Sign via createPaymentTransaction (legacy protocol / BtcOld).
   * Requires full raw previous transactions in req.rawTxs. */
  private async signLegacy(req: HardwareSignRequest): Promise<HardwareSignedTx> {
    const { splitTransaction } = await import(
      "@ledgerhq/hw-app-btc/lib/splitTransaction"
    );

    const app = this.app;
    const network = btcNetworkFor(req.network);
    const pathNoPrefix = req.derivationPath.replace(/^m\//, "");

    const inputs: any[] = [];
    const associatedKeysets: string[] = [];
    for (const u of req.inputs) {
      const rawTx = req.rawTxs?.[u.txid];
      if (!rawTx) {
        throw new Error(
          `Missing raw transaction for input ${u.txid}. Required for legacy Ledger signing.`,
        );
      }
      const tx = splitTransaction(rawTx, true);
      inputs.push([tx, u.vout]);
      associatedKeysets.push(pathNoPrefix);
    }

    const outputs: { value: bigint; script: Uint8Array }[] = [];
    const destScript = btcAddress.toOutputScript(req.toAddress, network);
    outputs.push({ value: req.amountSatoshis, script: new Uint8Array(destScript) });

    let totalInput = 0n;
    for (const u of req.inputs) totalInput += u.amountSatoshis;
    const change = totalInput - req.amountSatoshis - req.feeSatoshis;
    if (change > 546n) {
      outputs.push({
        value: change,
        script: new Uint8Array(Buffer.from(req.changeScriptPubKey, "hex")),
      });
    } else if (change < 0n) {
      throw new Error(
        `Insufficient funds: inputs ${totalInput} < amount ${req.amountSatoshis} + fee ${req.feeSatoshis}.`,
      );
    }

    const outputScriptHex = buildOutputScriptHex(outputs);

    const signedHex = await app.createPaymentTransaction({
      inputs,
      associatedKeysets,
      changePath: pathNoPrefix,
      outputScriptHex,
      segwit: true,
      additionals: ["bech32"],
    });

    return { hex: signedHex, txid: ledgerTxid(signedHex) };
  }

  /** Derive a compressed public key from the cached account xpub at the
   *  given full path. Uses AppClient.getExtendedPubkey (primary) or raw
   *  APDU (fallback) to fetch the account xpub. */
  private async derivePubkeyFromCache(path: string): Promise<Buffer> {
    const pathElements = parsePathNumbers(path);
    const accountPath = pathElements.slice(0, 3);
    const accountPathStr = pathArrayToString(accountPath);

    let accountXpub = this.xpubCache.get(accountPathStr);
    if (!accountXpub) {
      const app = await this.ensureApp();
      try {
        accountXpub = await app.getExtendedPubkey(false, accountPath);
      } catch {
        const data = Buffer.concat([
          Buffer.from([1]),
          pathElementsToBuffer(accountPath),
        ]);
        const response = await this.transport.send(
          0xE1, 0x00, 0x00, 0x01, data, [0x9000, 0xe000]
        );
        accountXpub = response.slice(0, -2).toString("ascii");
      }
      this.xpubCache.set(accountPathStr, accountXpub!);
    }

    const changeAndIndex = pathElements.slice(-2);
    const change = changeAndIndex[0] ?? 0;
    const addressIndex = changeAndIndex[1] ?? 0;

    const finalKey = deriveAddressKey(accountXpub!, change, addressIndex);
    return compressPubkey(Buffer.from(finalKey.pubkey));
  }

  async disconnect(): Promise<void> {
    try {
      await this.transport?.close?.();
    } catch {
      // ignore
    }
    this.transport = null;
    this.app = null;
    this.xpubCache.clear();
    this.masterFp = null;
  }
}

// Suppress unused-import lint for btcAddress
void btcAddress;
