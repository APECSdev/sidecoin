import { describe, it, expect, beforeEach, vi } from "vitest";
import { TrezorHardwareWallet } from "./trezor";
import type { HardwareSignRequest } from "./types";
import type { NetworkId } from "@sidecoin/shared";
import { Transaction } from "bitcoinjs-lib";

const { mockTC } = vi.hoisted(() => ({
  mockTC: {
    init: vi.fn().mockResolvedValue(undefined),
    getAddress: vi.fn().mockResolvedValue({
      success: true,
      payload: { address: "tb1qtestaddress", serializedPath: "m/84'/1'/0'/0/0" },
    }),
    signTransaction: vi.fn().mockResolvedValue({
      success: true,
      payload: { serializedTx: "", signedTx: "" },
    }),
  },
}));

vi.mock("@trezor/connect-web", () => ({ default: mockTC }));

/**
 * Build a minimal valid legacy transaction hex for mock `signTransaction`
 * results.  Uses bitcoinjs-lib itself so the hex is guaranteed parseable by
 * the same library that `trezor.ts` uses for txid computation.
 *
 * Structure: version=2, 1 input (fake prevout, empty scriptSig), 1 OP_RETURN
 * output (0 sats), locktime=0.
 */
function makeValidMockHex(): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(new Uint8Array(32), 0, 0xffffffff);
  tx.addOutput(new Uint8Array([0x6a]), 0n);
  return tx.toHex();
}

const VALID_MOCK_HEX = makeValidMockHex();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TrezorHardwareWallet", () => {
  describe("connect", () => {
    it("initializes TrezorConnect with manifest and lazyLoad", async () => {
      const wk = new TrezorHardwareWallet();
      await wk.connect();

      expect(mockTC.init).toHaveBeenCalledWith(
        expect.objectContaining({
          manifest: expect.objectContaining({
            appUrl: "wallet.sidecoin.app",
            email: "hello@sidecoin.app",
          }),
          lazyLoad: true,
        }),
      );
    });

    it("throws when init fails", async () => {
      mockTC.init.mockRejectedValueOnce(new Error("Manifest already registered"));
      const wk = new TrezorHardwareWallet();
      await expect(wk.connect()).rejects.toThrow("Manifest already registered");
    });

    it("does not re-init if already initialized", async () => {
      const wk = new TrezorHardwareWallet();
      await wk.connect();
      await wk.connect();
      expect(mockTC.init).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAddress", () => {
    it("calls getAddress with path, coin, and showOnTrezor", async () => {
      const wk = new TrezorHardwareWallet();
      await wk.connect();
      await wk.getAddress("m/84'/1'/0'/0/0", {
        coin: "test",
        showOnDevice: true,
      });

      expect(mockTC.getAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "m/84'/1'/0'/0/0",
          coin: "test",
          showOnTrezor: true,
        }),
      );
    });

    it("returns address and publicKey from the device", async () => {
      const wk = new TrezorHardwareWallet();
      await wk.connect();
      const result = await wk.getAddress("m/84'/1'/0'/0/0");
      expect(result.address).toBe("tb1qtestaddress");
      expect(result.publicKey).toBe("");
      expect(result.path).toBe("m/84'/1'/0'/0/0");
    });

    it("defaults coin to 'btc' and showOnDevice to false", async () => {
      const wk = new TrezorHardwareWallet();
      await wk.connect();
      await wk.getAddress("m/84'/0'/0'/0/0");

      expect(mockTC.getAddress).toHaveBeenCalledWith(
        expect.objectContaining({ coin: "btc", showOnTrezor: false }),
      );
    });

    it("throws when not connected", async () => {
      const wk = new TrezorHardwareWallet();
      await expect(wk.getAddress("m/84'/1'/0'/0/0")).rejects.toThrow(
        /not connected/i,
      );
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
      toAddress: "tb1qrecipient",
      amountSatoshis: 1000000n,
      feeSatoshis: 141n,
      changeScriptPubKey: "0014" + "cd".repeat(20),
    };

    it("calls signTransaction with coin, inputs, outputs, and refTxs", async () => {
      mockTC.signTransaction.mockResolvedValueOnce({
        success: true,
        payload: { serializedTx: VALID_MOCK_HEX },
      });
      const wk = new TrezorHardwareWallet();
      await wk.connect();
      await wk.signTransaction(req);

      expect(mockTC.signTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          coin: "test",
          inputs: expect.any(Array),
          outputs: expect.any(Array),
          refTxs: expect.any(Array),
        }),
      );
    });

    it("returns hex and txid computed locally via bitcoinjs-lib", async () => {
      mockTC.signTransaction.mockResolvedValueOnce({
        success: true,
        payload: { serializedTx: VALID_MOCK_HEX },
      });
      const wk = new TrezorHardwareWallet();
      await wk.connect();
      const result = await wk.signTransaction(req);
      const expectedTxid = Transaction.fromHex(VALID_MOCK_HEX).getId();
      expect(result.hex).toBe(VALID_MOCK_HEX);
      expect(result.txid).toBe(expectedTxid);
    });

    it("throws when not connected", async () => {
      const wk = new TrezorHardwareWallet();
      await expect(wk.signTransaction(req)).rejects.toThrow(/not connected/i);
    });

    it("throws when device returns no serializedTx", async () => {
      mockTC.signTransaction.mockResolvedValueOnce({
        success: true,
        payload: { serializedTx: undefined, signedTx: undefined },
      });
      const wk = new TrezorHardwareWallet();
      await wk.connect();
      await expect(wk.signTransaction(req)).rejects.toThrow(
        /no serialized transaction/,
      );
    });

    it("throws when device signing fails", async () => {
      mockTC.signTransaction.mockResolvedValueOnce({
        success: false,
        payload: { error: "Failure_ActionCancelled: cancelled" },
      });
      const wk = new TrezorHardwareWallet();
      await wk.connect();
      await expect(wk.signTransaction(req)).rejects.toThrow(
        "Failure_ActionCancelled: cancelled",
      );
    });
  });

  describe("disconnect", () => {
    it("clears connection state and requires reconnect", async () => {
      const wk = new TrezorHardwareWallet();
      await wk.connect();
      await wk.disconnect();
      await expect(wk.getAddress("m/84'/1'/0'/0/0")).rejects.toThrow(
        /not connected/i,
      );
    });

    it("is a no-op when already disconnected", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const wk = new TrezorHardwareWallet();
      await expect(wk.disconnect()).resolves.not.toThrow();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[Trezor]"));
      logSpy.mockRestore();
    });
  });
});
