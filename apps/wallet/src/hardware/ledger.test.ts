import { describe, it, expect, beforeEach, vi } from "vitest";
import { LedgerHardwareWallet } from "./ledger";
import type { HardwareSignRequest } from "./types";
import type { NetworkId } from "@sidecoin/shared";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { sha512 } from "@noble/hashes/sha2";
import { hmac } from "@noble/hashes/hmac";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { Psbt, payments, networks } from "bitcoinjs-lib";

// -- Mock fixtures (hoisted — no external deps, available to vi.mock) --------

const SIGNED_TX_HEX = "0200000001deadbeef";

const {
  mockTransport,
  mockAppClient,
  MockAppClient,
  mockPsbtV2,
  mockExtract,
  mockFinalize,
  mockHardenedPathOf,
  mockCreateKey,
  MockWalletPolicy,
  mockGetAppAndVersion,
} = vi.hoisted(() => {
  const transport = {
    close: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
  };

  const appClient = {
    getExtendedPubkey: vi.fn(),
    getMasterFingerprint: vi.fn(),
    getWalletAddress: vi.fn(),
    signPsbtBuffer: vi.fn(),
    signPsbt: vi.fn(),
  };

  // vitest 4 requires `function` or `class` — not an arrow — for `new`.
  const AppClientCtor = vi.fn(function AppClientImpl(this: any, transport: any) {
    this.transport = transport;
    this.getExtendedPubkey = appClient.getExtendedPubkey;
    this.getMasterFingerprint = appClient.getMasterFingerprint;
    this.getWalletAddress = appClient.getWalletAddress;
    this.signPsbtBuffer = appClient.signPsbtBuffer;
    this.signPsbt = appClient.signPsbt;
  });

  const psbtV2 = {
    getGlobalOutputCount: vi.fn().mockReturnValue(2),
    getOutputScript: vi.fn(),
    setOutputBip32Derivation: vi.fn(),
    getInputKeyDatas: vi.fn(),
    setInputPartialSig: vi.fn(),
    setInputTapKeySig: vi.fn(),
  };

  const extract = vi.fn();
  const finalize = vi.fn();
  const hardenedPathOf = vi.fn();
  const createKey = vi.fn();

  const WalletPolicyCtor = vi.fn(function WalletPolicyImpl(
    this: any,
    template: string,
    _key: string,
  ) {
    this.descriptorTemplate = template;
    this.getWalletId = vi.fn().mockReturnValue(Buffer.alloc(32));
  });

  const getAppAndVersion = vi.fn();

  return {
    mockTransport: transport,
    mockAppClient: appClient,
    MockAppClient: AppClientCtor,
    mockPsbtV2: psbtV2,
    mockExtract: extract,
    mockFinalize: finalize,
    mockHardenedPathOf: hardenedPathOf,
    mockCreateKey: createKey,
    MockWalletPolicy: WalletPolicyCtor,
    mockGetAppAndVersion: getAppAndVersion,
  };
});

// -- Module mocks ------------------------------------------------------------

vi.mock("@ledgerhq/hw-transport-webusb", () => ({
  default: {
    create: vi.fn().mockResolvedValue(mockTransport),
  },
}));

vi.mock("@ledgerhq/hw-transport-webhid", () => ({
  default: {
    create: vi.fn().mockResolvedValue(mockTransport),
  },
}));

vi.mock("@ledgerhq/hw-app-btc/lib/getAppAndVersion.js", () => ({
  getAppAndVersion: mockGetAppAndVersion,
}));

vi.mock("@ledgerhq/hw-app-btc/lib/newops/appClient", () => ({
  AppClient: MockAppClient,
}));

vi.mock("@ledgerhq/psbtv2", () => ({
  PsbtV2: {
    fromV0: vi.fn().mockReturnValue(mockPsbtV2),
  },
  psbtIn: {
    BIP32_DERIVATION: 0,
    TAP_BIP32_DERIVATION: 5,
  },
}));

vi.mock("@ledgerhq/hw-app-btc/lib/newops/policy", () => ({
  WalletPolicy: MockWalletPolicy,
  createKey: mockCreateKey,
}));

vi.mock("@ledgerhq/hw-app-btc/lib/bip32", () => ({
  hardenedPathOf: mockHardenedPathOf,
}));

vi.mock("@ledgerhq/hw-app-btc/lib/newops/psbtFinalizer", () => ({
  finalize: mockFinalize,
}));

vi.mock("@ledgerhq/hw-app-btc/lib/newops/psbtExtractor", () => ({
  extract: mockExtract,
}));

// -- Test fixtures (computed after imports are resolved) ---------------------

// Build a valid testnet xpub from a known private key (1).

const TEST_ACCOUNT_PUBKEY = Buffer.from(secp256k1.getPublicKey(Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex"), true));
const TEST_CHAINCODE = Buffer.alloc(32, 0x42);
const TEST_MASTER_FP = Buffer.from([0x76, 0xfb, 0xd7, 0xa6]);

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58checkEncode(payload: Buffer): string {
  const hashOnce = Buffer.from(sha256(payload));
  const hashTwice = Buffer.from(sha256(hashOnce));
  const checksum = hashTwice.subarray(0, 4);
  const data = Buffer.concat([payload, checksum]);
  let num = 0n;
  for (const byte of data) num = num * 256n + BigInt(byte);
  let result = "";
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    result = BASE58_ALPHABET[remainder] + result;
  }
  for (const byte of data) {
    if (byte === 0) result = "1" + result;
    else break;
  }
  return result;
}

// tpub layout: version(4) + depth(1) + parentFp(4) + childNum(4) + chaincode(32) + pubkey(33)
const TPUB_PAYLOAD = Buffer.alloc(78);
TPUB_PAYLOAD.writeUInt32BE(0x043587cf, 0); // tpub
TPUB_PAYLOAD[4] = 0; // depth
TPUB_PAYLOAD.writeUInt32BE(0, 5); // parent fingerprint
TPUB_PAYLOAD.writeUInt32BE(0, 9); // child number
TEST_CHAINCODE.copy(TPUB_PAYLOAD, 13);
TEST_ACCOUNT_PUBKEY.copy(TPUB_PAYLOAD, 45);
const TEST_ACCOUNT_XPUB = base58checkEncode(TPUB_PAYLOAD);

// Compute expected child pubkey at change=0, addressIndex=0 (m/84'/1'/0'/0/0)
function deriveChild(
  parentPubkey: Buffer,
  parentChaincode: Buffer,
  index: number,
): { pubkey: Buffer; chaincode: Buffer } {
  const data = Buffer.alloc(parentPubkey.length + 4);
  parentPubkey.copy(data, 0);
  data.writeUInt32BE(index, parentPubkey.length);
  const I = Buffer.from(hmac(sha512, parentChaincode, data));
  const IL = I.subarray(0, 32);
  const IR = I.subarray(32);
  const tweak = BigInt(`0x${IL.toString("hex")}`);
  const parentPoint = secp256k1.Point.fromHex(parentPubkey.toString("hex"));
  const tweakPoint = secp256k1.Point.BASE.multiply(tweak);
  const childPoint = parentPoint.add(tweakPoint);
  return {
    pubkey: Buffer.from(childPoint.toBytes(true)),
    chaincode: Buffer.from(IR),
  };
}

const TEST_CHANGE = deriveChild(TEST_ACCOUNT_PUBKEY, TEST_CHAINCODE, 0);
const TEST_FINAL = deriveChild(TEST_CHANGE.pubkey, TEST_CHANGE.chaincode, 0);
const TEST_DERIVED_PUBKEY = TEST_FINAL.pubkey;
const TEST_DERIVED_PUBKEY_HEX = TEST_DERIVED_PUBKEY.toString("hex");

// Compute expected P2WPKH address
const TEST_P2WPKH = payments.p2wpkh({
  pubkey: TEST_DERIVED_PUBKEY,
  network: networks.testnet,
});
const TEST_DERIVED_ADDRESS = TEST_P2WPKH.address!;

// Compute expected scriptPubKey and hash160 for knownAddressDerivations
const TEST_PUBKEY_HASH = ripemd160(sha256(TEST_DERIVED_PUBKEY));
const TEST_PUBKEY_HASH_HEX = Buffer.from(TEST_PUBKEY_HASH).toString("hex");
const TEST_SPK_HEX = "0014" + TEST_PUBKEY_HASH_HEX;

// Dummy DER-encoded signature for signPsbt mock
const DUMMY_SIG = Buffer.alloc(72, 0x42);

// Valid BIP-173 testnet P2WPKH address
const VALID_TB1 = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

// -- Setup -------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Transport
  mockTransport.close.mockResolvedValue(undefined);
  mockTransport.send.mockResolvedValue(
    Buffer.concat([
      Buffer.from(TEST_ACCOUNT_XPUB, "ascii"),
      Buffer.from([0x90, 0x00]),
    ]),
  );

  // AppClient methods
  mockAppClient.getExtendedPubkey.mockResolvedValue(TEST_ACCOUNT_XPUB);
  mockAppClient.getMasterFingerprint.mockResolvedValue(TEST_MASTER_FP);
  mockAppClient.getWalletAddress.mockResolvedValue(TEST_DERIVED_ADDRESS);
  mockAppClient.signPsbtBuffer.mockResolvedValue({
    psbt: Buffer.alloc(0),
    tx: SIGNED_TX_HEX,
  });
  mockAppClient.signPsbt.mockResolvedValue(new Map([[0, DUMMY_SIG]]));

  // PsbtV2 instance
  mockPsbtV2.getGlobalOutputCount.mockReturnValue(2);
  mockPsbtV2.getOutputScript.mockImplementation((i: number) => {
    if (i === 0) return Buffer.from("0014" + "ab".repeat(20), "hex");
    if (i === 1) return Buffer.from("0014" + "cd".repeat(20), "hex");
    throw new Error("no such output");
  });
  mockPsbtV2.setOutputBip32Derivation.mockReset();
  mockPsbtV2.getInputKeyDatas.mockReturnValue([TEST_DERIVED_PUBKEY]);
  mockPsbtV2.setInputPartialSig.mockReset();
  mockPsbtV2.setInputTapKeySig.mockReset();

  // Policy
  mockCreateKey.mockReturnValue("mock-key-string");
  MockWalletPolicy.mockImplementation(function (
    this: any,
    template: string,
    _key: string,
  ) {
    this.descriptorTemplate = template;
    this.getWalletId = vi.fn().mockReturnValue(Buffer.alloc(32));
  });

  // bip32
  mockHardenedPathOf.mockImplementation((path: number[]) => {
    const result: number[] = [];
    for (const n of path) {
      result.push(n);
      if (n < 0x80000000) break;
    }
    return result;
  });

  // Finalizer / Extractor
  mockFinalize.mockReset();
  mockExtract.mockReturnValue(Buffer.from(SIGNED_TX_HEX, "hex"));

  // getAppAndVersion
  mockGetAppAndVersion.mockResolvedValue({
    name: "Bitcoin Test",
    version: "2.2.5",
  });
});

/** Compute the display-order txid (big-endian hex) the same way ledger.ts does. */
function expectedTxid(hex: string): string {
  const bytes = Buffer.from(hex, "hex");
  const once = Buffer.from(sha256(bytes));
  const twice = Buffer.from(sha256(once));
  return twice.reverse().toString("hex");
}

// -- Tests -------------------------------------------------------------------

describe("LedgerHardwareWallet", () => {
  describe("connect", () => {
    it("creates WebUSB transport and constructs AppClient", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      expect(MockAppClient).toHaveBeenCalledWith(mockTransport);
    });
  });

  describe("getAddress", () => {
    it("calls getExtendedPubkey with display=false and getWalletAddress when verify=true", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.getAddress("m/84'/1'/0'/0/0", { showOnDevice: true });

      // accountPath = first 3 elements of parsed path
      expect(mockAppClient.getExtendedPubkey).toHaveBeenCalledWith(false, [
        0x80000054, // 84'
        0x80000001, // 1'
        0x80000000, // 0'
      ]);
      // getWalletAddress called with (policy, null, change, addressIndex, display=true)
      expect(mockAppClient.getWalletAddress).toHaveBeenCalledWith(
        expect.anything(),
        null,
        0,
        0,
        true,
      );
    });

    it("returns locally derived address and publicKey from xpub", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      const result = await wk.getAddress("m/84'/1'/0'/0/0");
      expect(result.address).toBe(TEST_DERIVED_ADDRESS);
      expect(result.publicKey).toBe(TEST_DERIVED_PUBKEY_HEX);
      expect(result.path).toBe("m/84'/1'/0'/0/0");
    });

    it("defaults verify to false and does not call getWalletAddress", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.getAddress("m/84'/1'/0'/0/0");
      expect(mockAppClient.getWalletAddress).not.toHaveBeenCalled();
    });

    it("auto-connects via ensureApp if connect() was not called first", async () => {
      const wk = new LedgerHardwareWallet();
      const result = await wk.getAddress("m/84'/1'/0'/0/0");
      expect(result.address).toBe(TEST_DERIVED_ADDRESS);
      expect(MockAppClient).toHaveBeenCalled();
    });
  });

  describe("signTransaction", () => {
    const req: HardwareSignRequest = {
      network: "signet" as NetworkId,
      derivationPath: "m/84'/1'/0'/0/0",
      inputs: [
        {
          txid: "a".repeat(64),
          vout: 0,
          amountSatoshis: 1337000n,
          scriptPubKey: "0014" + "ab".repeat(20),
        },
      ],
      toAddress: VALID_TB1,
      amountSatoshis: 1000000n,
      feeSatoshis: 141n,
      changeScriptPubKey: "0014" + "cd".repeat(20),
    };

    it("calls getExtendedPubkey for pubkey derivation, then signPsbtBuffer", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.signTransaction(req);

      expect(mockAppClient.getExtendedPubkey).toHaveBeenCalledWith(false, [
        0x80000054, // 84'
        0x80000001, // 1'
        0x80000000, // 0'
      ]);
      expect(mockAppClient.signPsbtBuffer).toHaveBeenCalledTimes(1);
    });

    it("passes finalizePsbt, accountPath, addressFormat, and knownAddressDerivations", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.signTransaction(req);

      const [psbtBuffer, options] = mockAppClient.signPsbtBuffer.mock.calls[0];

      expect(Buffer.isBuffer(psbtBuffer)).toBe(true);
      expect(options.finalizePsbt).toBe(true);
      expect(options.accountPath).toBe("m/84'/1'/0'");
      expect(options.addressFormat).toBe("bech32");
      expect(options.knownAddressDerivations).toBeInstanceOf(Map);
      // Dual-key registration: full scriptPubKey hex + 20-byte hash160 hex.
      expect(options.knownAddressDerivations.size).toBe(2);
      expect(options.knownAddressDerivations.has(TEST_SPK_HEX)).toBe(true);
      expect(options.knownAddressDerivations.has(TEST_PUBKEY_HASH_HEX)).toBe(
        true,
      );

      const entry = options.knownAddressDerivations.get(TEST_SPK_HEX);
      expect(entry.pubkey).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(entry.pubkey).toString("hex")).toBe(
        TEST_DERIVED_PUBKEY_HEX,
      );
      expect(entry.path).toEqual([
        0x80000054, // 84'
        0x80000001, // 1'
        0x80000000, // 0'
        0, // 0
        0, // 0
      ]);
    });

    it("builds a PSBT with correct inputs, destination, and change output", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.signTransaction(req);

      const [psbtBuffer] = mockAppClient.signPsbtBuffer.mock.calls[0];
      const psbt = Psbt.fromBuffer(psbtBuffer);

      // 1 input, 2 outputs (destination + change)
      expect(psbt.txInputs.length).toBe(1);
      expect(psbt.txOutputs.length).toBe(2);

      // Input witnessUtxo (accessed via the internal data array).
      const witnessUtxo = (psbt as any).data.inputs[0].witnessUtxo;
      expect(witnessUtxo).toBeDefined();
      expect(witnessUtxo.value).toBe(BigInt(1337000));
      expect(Buffer.from(witnessUtxo.script).toString("hex")).toBe(
        "0014" + "ab".repeat(20),
      );

      // Destination output
      expect(psbt.txOutputs[0].value).toBe(BigInt(1000000));

      // Change output: 1337000 - 1000000 - 141 = 336859
      expect(psbt.txOutputs[1].value).toBe(BigInt(336859));
      expect(Buffer.from(psbt.txOutputs[1].script).toString("hex")).toBe(
        "0014" + "cd".repeat(20),
      );
    });

    it("returns hex and computed txid from the signed transaction", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      const result = await wk.signTransaction(req);
      expect(result.hex).toBe(SIGNED_TX_HEX);
      expect(result.txid).toBe(expectedTxid(SIGNED_TX_HEX));
    });

    it("throws when Ledger returns no signed transaction (tx undefined)", async () => {
      // signPsbtBuffer returns undefined tx → caught → falls through to
      // signPsbtDirect → extract returns empty → "no signed transaction."
      mockAppClient.signPsbtBuffer.mockResolvedValue({
        psbt: Buffer.alloc(0),
        tx: undefined,
      });
      mockExtract.mockReturnValue(Buffer.alloc(0));

      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await expect(wk.signTransaction(req)).rejects.toThrow(
        /no signed transaction/,
      );
    });

    it("throws on insufficient funds (inputs < amount + fee)", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      const badReq: HardwareSignRequest = {
        ...req,
        amountSatoshis: 2000000n,
        feeSatoshis: 141n,
      };
      await expect(wk.signTransaction(badReq)).rejects.toThrow(
        /Insufficient funds/,
      );
    });

    it("skips change output when change is at or below dust limit (546 sats)", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      // totalInput = 1337000, fee = 141, change = 546 (NOT > 546, so no change)
      const dustReq: HardwareSignRequest = {
        ...req,
        amountSatoshis: 1337000n - 141n - 546n, // = 1336313
        feeSatoshis: 141n,
      };
      await wk.signTransaction(dustReq);

      const [psbtBuffer] = mockAppClient.signPsbtBuffer.mock.calls[0];
      const psbt = Psbt.fromBuffer(psbtBuffer);
      expect(psbt.txOutputs.length).toBe(1); // destination only, no change
    });
  });

  describe("disconnect", () => {
    it("closes the transport and resets internal app state", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.disconnect();
      expect(mockTransport.close).toHaveBeenCalledTimes(1);
    });

    it("re-creates transport and app on next use after disconnect", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.disconnect();
      // MockAppClient was called once during connect().
      expect(MockAppClient).toHaveBeenCalledTimes(1);
      // Next call auto-connects via ensureApp().
      await wk.getAddress("m/84'/1'/0'/0/0");
      expect(MockAppClient).toHaveBeenCalledTimes(2);
    });
  });
});
