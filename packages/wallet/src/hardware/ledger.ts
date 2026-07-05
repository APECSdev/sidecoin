// packages/wallet/src/hardware/ledger.ts
//
// Ledger hardware wallet adapter (read + sign). Chromium desktop + HTTPS/localhost only.
//
// Transport: WebHID is used when available (Chrome/Edge). WebHID is the same
// transport Ledger Live uses, and the new Bitcoin app (app-bitcoin-new,
// CLA 0xE1) only responds on the HID interface — NOT the WebUSB bulk
// transfer interface. WebUSB is kept as a fallback only for browsers
// without WebHID support (e.¬g. Firefox).
//
// IMPORTANT: Ledger Live desktop must be CLOSED before connecting. It holds
// exclusive access to the HID interface and will prevent the browser from
// opening the device.
//
// The @ledgerhq/hw-app-btc v11 Btc class auto-selects between BtcNew (new
// APDU protocol, CLA 0xE1, app-bitcoin-new v2.1.0+) and BtcOld (legacy APDU
// protocol, CLA 0xE0, app-bitcoin). This adapter probes at first use: if
// the new-protocol APDUs are rejected with 0x6d00/0x6e00 (CLA/INS not
// supported), it falls back to BtcOld and uses the legacy
// createPaymentTransaction signing path (which requires full prevout txs,
// available via getRawTransaction from the drivechain explorer).
//
// CRITICAL: On Bitcoin app v2.2.7 (Nano S, OS 2.1.0), getExtendedPubkey
// with display=false FAILS for testnet/signet paths (coin_type=1') with
// 0x6a82, but SUCCEEDS for mainnet paths (coin_type=0'). The fix is to
// send the raw GET_PUBKEY APDU with display=true, then derive the address
// locally using BIP-32 CKDpub math implemented with @noble/curves and
// @noble/hashes (ESM imports that work natively in Vite). This bypasses
// both the firmware's display restriction and a separate firmware bug
// where getWalletAddress rejects the xpub with 0x6a80.
//
// NOTE: The Ledger SDK's internal bip32.js CANNOT be imported in the
// browser because it uses CommonJS require() internally, which Vite cannot
// shim. We implement BIP-32 derivation directly.

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

// ── Base58check decode (local implementation, no CJS dependencies) ──
// bs58check@2.1.2 pulls in create-hash → md5 → readable-stream → Node
// stream/util, which Vite externalizes and breaks. This pure-JS decoder
// uses only @noble/hashes/sha256 (already imported, ESM-native).

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58checkDecode(str: string): Buffer {
  // Decode base58 to bytes (big-endian)
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
  // Leading '1' = leading zero byte
  for (const c of str) {
    if (c !== "1") break;
    bytes.push(0);
  }
  // Reverse to big-endian
  const decoded = Buffer.from(bytes.reverse());

  // Verify + strip checksum (last 4 bytes)
  const payload = decoded.subarray(0, -4);
  const checksum = decoded.subarray(-4);
  const hashOnce = Buffer.from(sha256(payload));
  const hashTwice = Buffer.from(sha256(hashOnce));
  if (!hashTwice.subarray(0, 4).equals(checksum)) {
    throw new Error("Invalid base58check checksum");
  }
  return payload;
}

// ── BIP-32 CKDpub (local implementation using @noble/curves + @noble/hashes) ──
// Replaces the Ledger SDK's internal bip32.js which uses CJS require() that
// Vite cannot shim in the browser.

/** Decode an xpub string into its components: chaincode (32 bytes),
 *  pubkey (33 bytes), and version (4 bytes). */
function getXpubComponents(xpub: string): {
  chaincode: Buffer;
  pubkey: Buffer;
  version: number;
} {
  const buf = base58checkDecode(xpub);
  // xpub layout: [4 version][1 depth][4 parent fingerprint][4 child number]
  //              [32 chaincode][33 pubkey]
  return {
    version: buf.readUInt32BE(0),
    chaincode: buf.subarray(13, 13 + 32),
    pubkey: buf.subarray(buf.length - 33),
  };
}

/** Derive a child public key from a parent public key using BIP-32
 *  non-hardened derivation (CKDpub). Returns the child pubkey (33 bytes
 *  compressed) and child chaincode (32 bytes).
 *
 *  Algorithm: I = HMAC-SHA512(chaincode, pubkey || ser32(i))
 *             IL = I[0:32], IR = I[32:64] (child chaincode)
 *             Ki = point(parse256(IL)) + Kpar (elliptic curve point addition) */
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

  // I = HMAC-SHA512(Key = chaincode, Data = serP(Kpar) || ser32(i))
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

  // Ki = point(parse256(IL)) + Kpar
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
 *  incompatibility, signalling that we should fall back to the legacy
 *  BtcOld protocol. 0x6a82 (FILE_NOT_FOUND) is explicitly EXCLUDED because
 *  it indicates a wrong path or rejected display flag, not a protocol
 *  mismatch. */
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

/** Convert a BIP-32 path element array to a display string like "m/84'/1'/0'".
 *  Mirrors the SDK's pathArrayToString for cache keys and debug logging. */
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

export class LedgerHardwareWallet implements HardwareWallet {
  readonly name = "Ledger";

  private transport: any = null;
  private app: any = null;
  private addressInFlight = false;
  private signInFlight = false;
  private useLegacy = false;

  // ── Testnet xpub cache ──
  // On Bitcoin app v2.2.7, getExtendedPubkey with display=false fails for
  // testnet paths (0x6a82). We call the raw APDU with display=true which
  // prompts the user to confirm, then cache the result so subsequent calls
  // (address derivation, signing) don't require another confirmation.
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
    // WebHID is the PRIMARY transport — it's what Ledger Live uses, and the
    // new Bitcoin app (app-bitcoin-new, CLA 0xE1) only responds on the HID
    // interface. WebUSB (bulk transfer) gets 0x6a82 from the new app.
    if (typeof navigator !== "undefined" && "hid" in navigator) {
      const { default: TransportWebHID } = await import(
        "@ledgerhq/hw-transport-webhid"
      );
      try {
        this.transport = await TransportWebHID.create();
        console.log("[Ledger DIAG] Using WebHID transport");
      } catch (hidErr: any) {
        const msg = hidErr?.message ?? String(hidErr);
        console.error('[Ledger DIAG] WebHID failed: "%s"', msg);
        if (/Failed to open|already open|busy|unable|access/i.test(msg)) {
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
      console.log(
        "[Ledger DIAG] WebHID not supported, using WebUSB " +
          "(NOTE: WebUSB does not work with the new Bitcoin app)",
      );
      const { default: TransportWebUSB } = await import(
        "@ledgerhq/hw-transport-webusb"
      );
      this.transport = await TransportWebUSB.create();
    }

    // ── DIAGNOSTIC: log the on-device app name + version ──
    try {
      const { getAppAndVersion } = await import(
        "@ledgerhq/hw-app-btc/lib/getAppAndVersion.js"
      );
      const info = await getAppAndVersion(this.transport);
      console.log(
        '[Ledger DIAG] Device app — name: "%s", version: "%s"',
        info.name,
        info.version,
      );
    } catch (diagErr) {
      console.error("[Ledger DIAG] Failed to read app version:", diagErr);
    }

    const { default: Btc } = await import("@ledgerhq/hw-app-btc");
    this.app = new (Btc as any)({ transport: this.transport, currency: "bitcoin" });
    return this.app;
  }

  /** Switch from BtcNew (new protocol) to BtcOld (legacy protocol) after
   *  detecting that the device has the old Bitcoin app. */
  private async switchToLegacy(): Promise<void> {
    console.log("[Ledger DIAG] Switching to BtcOld (legacy protocol)");
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
      console.log(
        '[Ledger DIAG] getAddress — path: "%s", verify: %s, useLegacy: %s',
        path,
        verify,
        this.useLegacy,
      );

      // ── Primary path: BtcNew.getWalletPublicKey (works for mainnet) ──
      try {
        console.log("[Ledger DIAG] Trying getWalletPublicKey (format: bech32)...");
        const res = await app.getWalletPublicKey(path, {
          format: "bech32",
          verify,
        });
        console.log(
          "[Ledger DIAG] SUCCESS — address: %s, pubkey: %s",
          res.bitcoinAddress,
          res.publicKey,
        );
        return {
          path,
          address: res.bitcoinAddress,
          publicKey: res.publicKey,
        };
      } catch (e: any) {
        console.error(
          '[Ledger DIAG] FAILED — message: "%s", statusCode: %s (0x%s)',
          e?.message,
          e?.statusCode,
          e?.statusCode?.toString(16),
        );

        // ── Direct raw APDU fallback (testnet/signet on app v2.2.7) ──
        // 0x6a82 means the path is valid but display=false was rejected
        // (firmware quirk on testnet). We bypass the SDK and send the raw
        // GET_PUBKEY APDU with display=true, then derive locally.
        if (!this.useLegacy && e?.statusCode === 0x6a82) {
          console.log(
            "[Ledger DIAG] 0x6a82 — trying raw APDU with display=true...",
          );
          try {
            const account = await this.getAddressDirect(path, verify, opts);
            if (account) return account;
          } catch (directErr: any) {
            console.error(
              '[Ledger DIAG] Raw APDU fallback FAILED — message: "%s", statusCode: 0x%s',
              directErr?.message,
              directErr?.statusCode?.toString(16),
            );
          }
        }

        // ── Fallback: try legacy protocol (BtcOld) ──
        // Only trigger on actual protocol mismatch (0x6d00, 0x6e00).
        if (!this.useLegacy && isLegacyFallback(e)) {
          console.log("[Ledger DIAG] Error qualifies for legacy fallback. Switching...");
          await this.switchToLegacy();

          console.log("[Ledger DIAG] Trying BtcOld getWalletPublicKey (format: legacy)...");
          try {
            const resLegacy = await this.app.getWalletPublicKey(path, {
              format: "legacy",
              verify: false,
            });
            console.log(
              "[Ledger DIAG] legacy format SUCCESS — address: %s, pubkey: %s",
              resLegacy.bitcoinAddress,
              resLegacy.publicKey,
            );

            console.log("[Ledger DIAG] Trying BtcOld getWalletPublicKey (format: bech32)...");
            try {
              const resBech32 = await this.app.getWalletPublicKey(path, {
                format: "bech32",
                verify,
              });
              console.log(
                "[Ledger DIAG] bech32 format SUCCESS — address: %s",
                resBech32.bitcoinAddress,
              );
              return {
                path,
                address: resBech32.bitcoinAddress,
                publicKey: resBech32.publicKey,
              };
            } catch (e2: any) {
              console.error(
                '[Ledger DIAG] bech32 on BtcOld FAILED — message: "%s", statusCode: 0x%s',
                e2?.message,
                e2?.statusCode?.toString(16),
              );
              console.log(
                "[Ledger DIAG] Deriving bech32 address locally from legacy pubkey...",
              );
              const pubkeyBuf = Buffer.from(resLegacy.publicKey, "hex");
              const network = btcNetworkFor((opts as any).network ?? "signet");
              const p2wpkh = payments.p2wpkh({ pubkey: pubkeyBuf, network });
              const derivedAddress = p2wpkh.address!;
              console.log(
                "[Ledger DIAG] Locally derived bech32 address: %s",
                derivedAddress,
              );
              return {
                path,
                address: derivedAddress,
                publicKey: resLegacy.publicKey,
              };
            }
          } catch (e3: any) {
            console.error(
              '[Ledger DIAG] legacy format on BtcOld ALSO FAILED — message: "%s", statusCode: 0x%s',
              e3?.message,
              e3?.statusCode?.toString(16),
            );
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
   * Raw APDU fallback for testnet/signet on Bitcoin app v2.2.7.
   *
   * Sends the GET_PUBKEY APDU directly via the transport interface with
   * display=true, bypassing the SDK's broken internal imports. Then
   * derives the child pubkey and address locally using BIP-32 CKDpub
   * implemented with @noble/curves + @noble/hashes (native ESM, no Vite
   * CJS interop issues).
   */
  private async getAddressDirect(
    path: string,
    verify: boolean,
    opts: GetAddressOpts,
  ): Promise<HardwareAccount | null> {
    const pathElements = parsePathNumbers(path);
    // Account path is the first 3 elements for standard paths (m/84'/1'/0')
    const accountPath = pathElements.slice(0, 3);
    const accountPathStr = pathArrayToString(accountPath);
    console.log(
      '[Ledger DIAG] getAddressDirect — accountPath: "%s", full path: "%s"',
      accountPathStr,
      path,
    );

    // ── Get account xpub via raw APDU (display=true, cached) ──
    let accountXpub = this.xpubCache.get(accountPathStr);
    if (!accountXpub) {
      console.log(
        "[Ledger DIAG] Requesting account xpub via raw APDU (confirm on device)...",
      );
      // CLA=0xE1, INS=0x00 (GET_PUBKEY), P1=0, P2=0 (PROTOCOL_VERSION)
      const data = Buffer.concat([
        Buffer.from([1]), // display=true
        pathElementsToBuffer(accountPath),
      ]);
      const response = await this.transport.send(
        0xE1, 0x00, 0x00, 0x00, data, [0x9000, 0xe000]
      );
      accountXpub = response.slice(0, -2).toString("ascii");
      this.xpubCache.set(accountPathStr, accountXpub);
      console.log(
        "[Ledger DIAG] Account xpub cached: %s...",
        accountXpub.substring(0, 24),
      );
    } else {
      console.log("[Ledger DIAG] Account xpub found in cache");
    }

    // ── Derive child pubkey locally using BIP-32 CKDpub ──
    const changeAndIndex = pathElements.slice(-2);
    const change = changeAndIndex[0] ?? 0;
    const addressIndex = changeAndIndex[1] ?? 0;

    const finalKey = deriveAddressKey(accountXpub, change, addressIndex);
    const pubkeyBuf = compressPubkey(Buffer.from(finalKey.pubkey));
    const publicKeyHex = pubkeyBuf.toString("hex");

    // ── Derive bech32 address locally using bitcoinjs-lib ──
    const network = btcNetworkFor((opts as any).network ?? "signet");
    const p2wpkh = payments.p2wpkh({ pubkey: pubkeyBuf, network });
    const address = p2wpkh.address!;

    console.log(
      "[Ledger DIAG] Locally derived address: %s, pubkey: %s",
      address,
      publicKeyHex,
    );

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
   * Sign via signPsbtBuffer (new protocol / BtcNew).
   *
   * On testnet/signet, signPsbtBuffer internally calls getExtendedPubkey(false,
   * ...) which fails. In that case, we fall back to signPsbtDirect which uses
   * the cached xpub.
   */
  private async signPsbt(req: HardwareSignRequest): Promise<HardwareSignedTx> {
    const app = await this.ensureApp();

    let pubkeyBuf: Buffer;
    try {
      const pubRes = await app.getWalletPublicKey(req.derivationPath, {
        format: "bech32",
        verify: false,
      });
      // SDK returns uncompressed pubkey (65 bytes); compress it for PSBT
      pubkeyBuf = compressPubkey(Buffer.from(pubRes.publicKey, "hex"));
      console.log(
        "[Ledger DIAG] signPsbt — pubkey from getWalletPublicKey: %s",
        pubkeyBuf.toString("hex"),
      );
    } catch (pubErr: any) {
      console.error(
        '[Ledger DIAG] signPsbt — getWalletPublicKey FAILED (0x%s), deriving from cache...',
        pubErr?.statusCode?.toString(16),
      );
      pubkeyBuf = await this.derivePubkeyFromCache(req.derivationPath);
      console.log(
        "[Ledger DIAG] signPsbt — derived pubkey from cache: %s",
        pubkeyBuf.toString("hex"),
      );
    }

    const pubkeyHash = hash160(pubkeyBuf);
    const spkHex = "0014" + Buffer.from(pubkeyHash).toString("hex");
    const network = btcNetworkFor(req.network);

    const psbt = new Psbt({ network });
    for (const u of req.inputs) {
      if (u.amountSatoshis > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(
          `UTXO amount ${u.amountSatoshis} exceeds safe integer range for PSBT construction.`,
        );
      }
      psbt.addInput({
        hash: u.txid,
        index: u.vout,
        witnessUtxo: {
          script: new Uint8Array(Buffer.from(u.scriptPubKey, "hex")),
          value: u.amountSatoshis,
        },
      });
    }

    psbt.addOutput({ address: req.toAddress, value: req.amountSatoshis });

    let totalInput = 0n;
    for (const u of req.inputs) totalInput += u.amountSatoshis;
    const change = totalInput - req.amountSatoshis - req.feeSatoshis;
    if (change > 546n) {
      psbt.addOutput({
        script: new Uint8Array(Buffer.from(req.changeScriptPubKey, "hex")),
        value: change,
      });
    } else if (change < 0n) {
      throw new Error(
        `Insufficient funds: inputs ${totalInput} < amount ${req.amountSatoshis} + fee ${req.feeSatoshis}.`,
      );
    }

    const psbtBuffer = Buffer.from(psbt.toBuffer());

    const pathNumbers = parsePathNumbers(req.derivationPath);
    const known = new Map<string, { pubkey: Buffer; path: number[] }>();
    const entry = { pubkey: pubkeyBuf, path: pathNumbers };
    known.set(spkHex, entry);
    known.set(Buffer.from(pubkeyHash).toString("hex"), entry);

    const accountPath = req.derivationPath
      .split("/")
      .slice(0, 4)
      .join("/");

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
      const txid = ledgerTxid(txHex);
      return { hex: txHex, txid };
    } catch (signErr: any) {
      console.error(
        '[Ledger DIAG] signPsbtBuffer FAILED (0x%s) — trying signPsbtDirect...',
        signErr?.statusCode?.toString(16),
      );
      if (signErr?.statusCode === 0x6a82 || signErr?.statusCode === 0x6e00) {
        return await this.signPsbtDirect(req, psbtBuffer);
      }
      throw signErr;
    }
  }

  /**
   * Sign via direct AppClient.signPsbt call (testnet/signet fallback).
   *
   * VERIFIED API: AppClient.signPsbt(psbt, walletPolicy, walletHMAC, progressCallback)
   * The PSBT parameter is the first argument, followed by the wallet policy.
   */
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

    const appClient = new AppClient(this.transport);
    const pathElements = parsePathNumbers(req.derivationPath);
    const accountPath = hardenedPathOf(pathElements);
    const accountPathStr = pathArrayToString(accountPath);

    let accountXpub = this.xpubCache.get(accountPathStr);
    if (!accountXpub) {
      console.log(
        "[Ledger DIAG] signPsbtDirect — requesting xpub via raw APDU...",
      );
      const data = Buffer.concat([
        Buffer.from([1]), // display=true
        pathElementsToBuffer(accountPath),
      ]);
      const response = await this.transport.send(
        0xE1, 0x00, 0x00, 0x00, data, [0x9000, 0xe000]
      );
      accountXpub = response.slice(0, -2).toString("ascii");
      this.xpubCache.set(accountPathStr, accountXpub);
    }

    if (!this.masterFp) {
      this.masterFp = await appClient.getMasterFingerprint();
    }

    const keyStr = createKey(this.masterFp, accountPath, accountXpub);
    // VERIFIED template: "wpkh(@0/**)" from the SDK's descrTemplFrom("bech32")
    const policy = new WalletPolicy("wpkh(@0/**)", keyStr);

    console.log("[Ledger DIAG] signPsbtDirect — calling AppClient.signPsbt...");

    // VERIFIED signature: signPsbt(psbt, walletPolicy, walletHMAC, progressCallback)
    const result = await appClient.signPsbt(
      psbtBuffer,
      policy,
      Buffer.alloc(32, 0),
      undefined,
    );

    let txHex: string | undefined;
    if (typeof result === "string") {
      txHex = result;
    } else if (result?.tx) {
      txHex = result.tx;
    } else if (result?.psbt) {
      const signedPsbt = Psbt.fromBuffer(Buffer.from(result.psbt));
      txHex = signedPsbt.extractTransaction().toHex();
    }

    if (!txHex) {
      throw new Error("Ledger returned no signed transaction.");
    }

    const txid = ledgerTxid(txHex);
    console.log("[Ledger DIAG] signPsbtDirect SUCCESS — txid: %s", txid);
    return { hex: txHex, txid };
  }

  /**
   * Sign via createPaymentTransaction (legacy protocol / BtcOld).
   */
  private async signLegacy(req: HardwareSignRequest): Promise<HardwareSignedTx> {
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
      const tx = app.splitTransaction(rawTx, true);
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

    const txid = ledgerTxid(signedHex);
    return { hex: signedHex, txid };
  }

  /** Derive a compressed public key from the cached account xpub at the
   *  given full path. Used when getWalletPublicKey fails (testnet/signet). */
  private async derivePubkeyFromCache(path: string): Promise<Buffer> {
    const pathElements = parsePathNumbers(path);
    const accountPath = pathElements.slice(0, 3);
    const accountPathStr = pathArrayToString(accountPath);

    let accountXpub = this.xpubCache.get(accountPathStr);
    if (!accountXpub) {
      console.log(
        "[Ledger DIAG] derivePubkeyFromCache — requesting xpub via raw APDU...",
      );
      const data = Buffer.concat([
        Buffer.from([1]), // display=true
        pathElementsToBuffer(accountPath),
      ]);
      const response = await this.transport.send(
        0xE1, 0x00, 0x00, 0x00, data, [0x9000, 0xe000]
      );
      accountXpub = response.slice(0, -2).toString("ascii");
      this.xpubCache.set(accountPathStr, accountXpub);
    }

    const changeAndIndex = pathElements.slice(-2);
    const change = changeAndIndex[0] ?? 0;
    const addressIndex = changeAndIndex[1] ?? 0;

    const finalKey = deriveAddressKey(accountXpub, change, addressIndex);
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
