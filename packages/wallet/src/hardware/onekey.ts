// packages/wallet/src/hardware/onekey.ts
//
// OneKey WebUSB adapter (read + sign). Chromium desktop + HTTPS/localhost only.
// The heavy SDK is dynamic-imported so it stays out of the main bundle and is
// never pulled into jsdom during unit tests.

import type {
  HardwareWallet,
  HardwareAccount,
  GetAddressOpts,
  HardwareSignRequest,
  HardwareSignedTx,
} from "./types";
import { toTrezorSignParams } from "./trezorFormat";

export class OneKeyHardwareWallet implements HardwareWallet {
  readonly name = "OneKey";

  private sdk: any = null;
  private initialized = false;
  private connectId: string | null = null;
  private deviceId: string | null = null;
  private addressInFlight = false;
  private signInFlight = false;

  private async ensureSdk(): Promise<any> {
    if (this.sdk) return this.sdk;
    const mod = await import("@onekeyfe/hd-common-connect-sdk");
    this.sdk = (mod as any).default ?? mod;
    return this.sdk;
  }

  async connect(): Promise<void> {
    const HardwareSDK = await this.ensureSdk();

    if (!this.initialized) {
      await HardwareSDK.init({
        env: "webusb",
        debug: import.meta.env.DEV,
        fetchConfig: true,
      });
      await this.bindEvents(HardwareSDK);
      this.initialized = true;
    }

    // Authorization MUST be inside a user gesture (Chrome requirement).
    const { ONEKEY_WEBUSB_FILTER } = await import("@onekeyfe/hd-shared");
    await (navigator as any).usb.requestDevice({ filters: ONEKEY_WEBUSB_FILTER });

    const search = await HardwareSDK.searchDevices();
    if (!search.success) throw new Error(search.payload.error);
    const first = search.payload[0];
    if (!first) throw new Error("No OneKey device found.");
    this.connectId = first.connectId;

    const features = await HardwareSDK.getFeatures(this.connectId);
    if (!features.success) throw new Error(features.payload.error);
    this.deviceId = features.payload.device_id;
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
      const HardwareSDK = await this.ensureSdk();
      if (!this.connectId || !this.deviceId) {
        throw new Error("Device not connected.");
      }

      const res = await HardwareSDK.btcGetAddress(this.connectId, this.deviceId, {
        path,
        coin: opts.coin ?? "btc",
        showOnOneKey: opts.showOnDevice ?? false,
      });
      if (!res.success) throw new Error(res.payload.error);
      return {
        path,
        address: res.payload.address,
        publicKey: (res.payload as any).publicKey ?? "",
      };
    } finally {
      this.addressInFlight = false;
    }
  }

  /**
   * Sign a P2WPKH spend on the OneKey device via btcSignTransaction (Trezor
   * format). Uses btcSignTransaction (not btcSignPsbt) because the former is
   * universally supported across OneKey firmware and returns finalized
   * serializedTx directly. refTxs is passed as [] — SegWit v0 inputs sign from
   * amount + address_n alone.
   *
   * RISK: if OneKey firmware rejects empty refTxs for segwit, raw prevout
   * transactions would be required (the wallet API exposes no raw-tx endpoint —
   * would need backend work). Watch for this on first device test.
   */
  async signTransaction(req: HardwareSignRequest): Promise<HardwareSignedTx> {
    if (this.signInFlight) {
      throw new Error("Signing request already in progress.");
    }

    this.signInFlight = true;
    try {
      const HardwareSDK = await this.ensureSdk();
      if (!this.connectId || !this.deviceId) {
        throw new Error("Device not connected.");
      }

      const params = toTrezorSignParams(req);
      const res = await HardwareSDK.btcSignTransaction(
        this.connectId,
        this.deviceId,
        {
          coin: params.coin,
          inputs: params.inputs,
          outputs: params.outputs,
          refTxs: params.refTxs,
        } as any,
      );
      if (!res.success) throw new Error(res.payload.error);

      const payload = res.payload as {
        signatures?: string[];
        serializedTx?: string;
        txid?: string;
      };
      if (!payload.serializedTx) {
        throw new Error("OneKey returned no serialized transaction.");
      }
      return {
        hex: payload.serializedTx,
        txid: payload.txid ?? "",
      };
    } finally {
      this.signInFlight = false;
    }
  }

  async disconnect(): Promise<void> {
    this.connectId = null;
    this.deviceId = null;
  }

  /** Prefer on-device PIN/passphrase entry - no custom keypad UI, most secure. */
  private async bindEvents(HardwareSDK: any): Promise<void> {
    const { UI_EVENT, UI_REQUEST, UI_RESPONSE } = await import("@onekeyfe/hd-core");
    HardwareSDK.on(UI_EVENT, async (message: any) => {
      if (message.type === UI_REQUEST.REQUEST_PIN) {
        await HardwareSDK.uiResponse({
          type: UI_RESPONSE.RECEIVE_PIN,
          payload: "@@ONEKEY_INPUT_PIN_IN_DEVICE",
        });
      } else if (message.type === UI_REQUEST.REQUEST_PASSPHRASE) {
        await HardwareSDK.uiResponse({
          type: UI_RESPONSE.RECEIVE_PASSPHRASE,
          payload: { passphraseOnDevice: true, value: "" },
        });
      }
    });
  }
}
