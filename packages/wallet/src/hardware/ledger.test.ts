import { describe, it, expect, beforeEach, vi } from "vitest";
import { LedgerHardwareWallet } from "./ledger";
import type { HardwareSignRequest } from "./types";
import type { NetworkId } from "@sidecoin/shared";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { Psbt } from "bitcoinjs-lib";

// -- Mock fixtures ------------------------------------------------------------

// Test compressed pubkey (33 bytes, 02 prefix).
const TEST_PUBKEY_HEX =
  "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";
const TEST_PUBKEY_BUF = Buffer.from(TEST_PUBKEY_HEX, "hex");
const TEST_PUBKEY_HASH = ripemd160(sha256(TEST_PUBKEY_BUF));
const TEST_SPK_HEX = "0014" + Buffer.from(TEST_PUBKEY_HASH).toString("hex");
const TEST_PUBKEY_HASH_HEX = Buffer.from(TEST_PUBKEY_HASH).toString("hex");

// Minimal signed-tx hex returned by the mocked signPsbtBuffer.
const SIGNED_TX_HEX = "0200000001deadbeef";

// Valid BIP-173 testnet P2WPKH address.
const VALID_TB1 = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

const { mockTransport, mockBtcApp, MockBtc } = vi.hoisted(() => {
  const transport = {
    close: vi.fn().mockResolvedValue(undefined),
  };
  const btcApp = {
    getWalletPublicKey: vi.fn(),
    signPsbtBuffer: vi.fn(),
  };
  // vitest 4 requires `function` or `class` — not an arrow — for `new`.
  const BtcCtor = vi.fn(function BtcImpl(this: any, options: any) {
    this.options = options;
    this.getWalletPublicKey = btcApp.getWalletPublicKey;
    this.signPsbtBuffer = btcApp.signPsbtBuffer;
  });
  return { mockTransport: transport, mockBtcApp: btcApp, MockBtc: BtcCtor };
});

vi.mock("@ledgerhq/hw-transport-webusb", () => ({
  default: {
    create: vi.fn().mockResolvedValue(mockTransport),
  },
}));

vi.mock("@ledgerhq/hw-app-btc", () => ({
  default: MockBtc,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockBtcApp.getWalletPublicKey.mockResolvedValue({
    bitcoinAddress: "tb1qledgeraddress",
    publicKey: TEST_PUBKEY_HEX,
    chainCode: "chaincodehex",
  });
  mockBtcApp.signPsbtBuffer.mockResolvedValue({
    psbt: Buffer.alloc(0),
    tx: SIGNED_TX_HEX,
  });
});

/** Compute the display-order txid (big-endian hex) the same way ledger.ts does. */
function expectedTxid(hex: string): string {
  const bytes = Buffer.from(hex, "hex");
  const once = Buffer.from(sha256(bytes));
  const twice = Buffer.from(sha256(once));
  return twice.reverse().toString("hex");
}

// -- Tests --------------------------------------------------------------------

describe("LedgerHardwareWallet", () => {
  describe("connect", () => {
    it("creates WebUSB transport and constructs Btc app with v11 options", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();

      expect(MockBtc).toHaveBeenCalledWith({
        transport: mockTransport,
        currency: "bitcoin",
      });
    });
  });

  describe("getAddress", () => {
    it("calls getWalletPublicKey with bech32 format and verify flag", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.getAddress("m/84'/1'/0'/0/0", { showOnDevice: true });

      expect(mockBtcApp.getWalletPublicKey).toHaveBeenCalledWith(
        "m/84'/1'/0'/0/0",
        { format: "bech32", verify: true },
      );
    });

    it("returns address and publicKey from the device", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      const result = await wk.getAddress("m/84'/1'/0'/0/0");
      expect(result.address).toBe("tb1qledgeraddress");
      expect(result.publicKey).toBe(TEST_PUBKEY_HEX);
      expect(result.path).toBe("m/84'/1'/0'/0/0");
    });

    it("defaults verify to false when showOnDevice is not provided", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.getAddress("m/84'/1'/0'/0/0");

      expect(mockBtcApp.getWalletPublicKey).toHaveBeenCalledWith(
        "m/84'/1'/0'/0/0",
        { format: "bech32", verify: false },
      );
    });

    it("auto-connects via ensureApp if connect() was not called first", async () => {
      const wk = new LedgerHardwareWallet();
      const result = await wk.getAddress("m/84'/1'/0'/0/0");
      expect(result.address).toBe("tb1qledgeraddress");
      expect(MockBtc).toHaveBeenCalled();
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

    it("calls getWalletPublicKey for the signing pubkey, then signPsbtBuffer", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.signTransaction(req);

      expect(mockBtcApp.getWalletPublicKey).toHaveBeenCalledWith(
        "m/84'/1'/0'/0/0",
        { format: "bech32", verify: false },
      );
      expect(mockBtcApp.signPsbtBuffer).toHaveBeenCalledTimes(1);
    });

    it("passes finalizePsbt, accountPath, addressFormat, and knownAddressDerivations", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.signTransaction(req);

      const [psbtBuffer, options] = mockBtcApp.signPsbtBuffer.mock.calls[0];

      expect(Buffer.isBuffer(psbtBuffer)).toBe(true);
      expect(options.finalizePsbt).toBe(true);
      expect(options.accountPath).toBe("m/84'/1'/0'");
      expect(options.addressFormat).toBe("bech32");
      expect(options.knownAddressDerivations).toBeInstanceOf(Map);
      // Dual-key registration: full scriptPubKey hex + 20-byte hash160 hex.
      expect(options.knownAddressDerivations.size).toBe(2);
      expect(options.knownAddressDerivations.has(TEST_SPK_HEX)).toBe(true);
      expect(options.knownAddressDerivations.has(TEST_PUBKEY_HASH_HEX)).toBe(true);

      const entry = options.knownAddressDerivations.get(TEST_SPK_HEX);
      expect(Buffer.isBuffer(entry.pubkey)).toBe(true);
      expect(entry.pubkey.toString("hex")).toBe(TEST_PUBKEY_HEX);
      expect(entry.path).toEqual([
        0x80000054, // 84'
        0x80000001, // 1'
        0x80000000, // 0'
        0,          // 0
        0,          // 0
      ]);
    });

    it("builds a PSBT with correct inputs, destination, and change output", async () => {
      const wk = new LedgerHardwareWallet();
      await wk.connect();
      await wk.signTransaction(req);

      const [psbtBuffer] = mockBtcApp.signPsbtBuffer.mock.calls[0];
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
      mockBtcApp.signPsbtBuffer.mockResolvedValueOnce({
        psbt: Buffer.alloc(0),
        tx: undefined,
      });
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

      const [psbtBuffer] = mockBtcApp.signPsbtBuffer.mock.calls[0];
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
      // MockBtc was called once during connect().
      expect(MockBtc).toHaveBeenCalledTimes(1);
      // Next call auto-connects via ensureApp().
      await wk.getAddress("m/84'/1'/0'/0/0");
      expect(MockBtc).toHaveBeenCalledTimes(2);
    });
  });
});
