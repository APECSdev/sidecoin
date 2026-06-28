import { describe, it, expect, beforeEach, vi } from "vitest";
import { OneKeyHardwareWallet } from "./onekey";
import type { HardwareSignRequest } from "./types";
import type { NetworkId } from "@sidecoin/shared";

const { mockSDK } = vi.hoisted(() => ({
  mockSDK: {
    init: vi.fn().mockResolvedValue(undefined),
    searchDevices: vi.fn().mockResolvedValue({
      success: true,
      payload: [{ connectId: "test-connect-id" }],
    }),
    getFeatures: vi.fn().mockResolvedValue({
      success: true,
      payload: { device_id: "test-device-id" },
    }),
    btcGetAddress: vi.fn().mockResolvedValue({
      success: true,
      payload: { address: "tb1qtestaddress", publicKey: "02abcdef" },
    }),
    btcSignTransaction: vi.fn().mockResolvedValue({
      success: true,
      payload: { serializedTx: "0200000001deadbeef", txid: "txid123" },
    }),
    on: vi.fn(),
    uiResponse: vi.fn(),
  },
}));

vi.mock("@onekeyfe/hd-common-connect-sdk", () => ({ default: mockSDK }));
vi.mock("@onekeyfe/hd-shared", () => ({
  ONEKEY_WEBUSB_FILTER: [{ vendorId: 0x1209 }],
}));
vi.mock("@onekeyfe/hd-core", () => ({
  UI_EVENT: "UI_EVENT",
  UI_REQUEST: { REQUEST_PIN: "REQUEST_PIN", REQUEST_PASSPHRASE: "REQUEST_PASSPHRASE" },
  UI_RESPONSE: { RECEIVE_PIN: "RECEIVE_PIN", RECEIVE_PASSPHRASE: "RECEIVE_PASSPHRASE" },
}));

beforeEach(() => {
  Object.defineProperty(navigator, "usb", {
    value: { requestDevice: vi.fn().mockResolvedValue({}) },
    configurable: true,
    writable: true,
  });
  vi.clearAllMocks();
});

describe("OneKeyHardwareWallet", () => {
  describe("connect", () => {
    it("initializes SDK, requests USB, searches devices, gets features", async () => {
      const wk = new OneKeyHardwareWallet();
      await wk.connect();

      expect(mockSDK.init).toHaveBeenCalledWith(
        expect.objectContaining({ env: "webusb" }),
      );
      expect(navigator.usb.requestDevice).toHaveBeenCalledWith({
        filters: [{ vendorId: 0x1209 }],
      });
      expect(mockSDK.searchDevices).toHaveBeenCalled();
      expect(mockSDK.getFeatures).toHaveBeenCalledWith("test-connect-id");
    });

    it("throws when no device is found", async () => {
      mockSDK.searchDevices.mockResolvedValueOnce({
        success: true,
        payload: [],
      });
      const wk = new OneKeyHardwareWallet();
      await expect(wk.connect()).rejects.toThrow(/No OneKey device found/);
    });

    it("throws when searchDevices fails", async () => {
      mockSDK.searchDevices.mockResolvedValueOnce({
        success: false,
        payload: { error: "USB_ERROR" },
      });
      const wk = new OneKeyHardwareWallet();
      await expect(wk.connect()).rejects.toThrow("USB_ERROR");
    });
  });

  describe("getAddress", () => {
    it("calls btcGetAddress with path, coin, and showOnOneKey", async () => {
      const wk = new OneKeyHardwareWallet();
      await wk.connect();
      await wk.getAddress("m/84'/1'/0'/0/0", {
        coin: "test",
        showOnDevice: true,
      });

      expect(mockSDK.btcGetAddress).toHaveBeenCalledWith(
        "test-connect-id",
        "test-device-id",
        { path: "m/84'/1'/0'/0/0", coin: "test", showOnOneKey: true },
      );
    });

    it("returns address and publicKey from the device", async () => {
      const wk = new OneKeyHardwareWallet();
      await wk.connect();
      const result = await wk.getAddress("m/84'/1'/0'/0/0");
      expect(result.address).toBe("tb1qtestaddress");
      expect(result.publicKey).toBe("02abcdef");
      expect(result.path).toBe("m/84'/1'/0'/0/0");
    });

    it("defaults coin to 'btc' and showOnDevice to false", async () => {
      const wk = new OneKeyHardwareWallet();
      await wk.connect();
      await wk.getAddress("m/84'/0'/0'/0/0");

      expect(mockSDK.btcGetAddress).toHaveBeenCalledWith(
        "test-connect-id",
        "test-device-id",
        expect.objectContaining({ coin: "btc", showOnOneKey: false }),
      );
    });

    it("throws when not connected", async () => {
      const wk = new OneKeyHardwareWallet();
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

    it("calls btcSignTransaction with coin, inputs, outputs, and refTxs", async () => {
      const wk = new OneKeyHardwareWallet();
      await wk.connect();
      await wk.signTransaction(req);

      expect(mockSDK.btcSignTransaction).toHaveBeenCalledWith(
        "test-connect-id",
        "test-device-id",
        expect.objectContaining({
          coin: "test",
          inputs: expect.any(Array),
          outputs: expect.any(Array),
          refTxs: expect.any(Array),
        }),
      );
    });

    it("returns hex and txid from the device", async () => {
      const wk = new OneKeyHardwareWallet();
      await wk.connect();
      const result = await wk.signTransaction(req);
      expect(result.hex).toBe("0200000001deadbeef");
      expect(result.txid).toBe("txid123");
    });

    it("throws when not connected", async () => {
      const wk = new OneKeyHardwareWallet();
      await expect(wk.signTransaction(req)).rejects.toThrow(/not connected/i);
    });

    it("throws when device returns no serializedTx", async () => {
      mockSDK.btcSignTransaction.mockResolvedValueOnce({
        success: true,
        payload: { serializedTx: undefined, txid: "abc" },
      });
      const wk = new OneKeyHardwareWallet();
      await wk.connect();
      await expect(wk.signTransaction(req)).rejects.toThrow(
        /no serialized transaction/,
      );
    });

    it("throws when device signing fails", async () => {
      mockSDK.btcSignTransaction.mockResolvedValueOnce({
        success: false,
        payload: { error: "Failure_DataError: bad input" },
      });
      const wk = new OneKeyHardwareWallet();
      await wk.connect();
      await expect(wk.signTransaction(req)).rejects.toThrow(
        "Failure_DataError: bad input",
      );
    });
  });

  describe("disconnect", () => {
    it("clears connection state", async () => {
      const wk = new OneKeyHardwareWallet();
      await wk.connect();
      await wk.disconnect();
      await expect(wk.getAddress("m/84'/1'/0'/0/0")).rejects.toThrow(
        /not connected/i,
      );
    });
  });
});
