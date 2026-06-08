// packages/wallet/src/hardware/onekey.ts
//
// OneKey WebUSB adapter (read-only). Chromium desktop + HTTPS/localhost only.
// The heavy SDK is dynamic-imported so it stays out of the main bundle and is
// never pulled into jsdom during unit tests.

import type { HardwareWallet, HardwareAccount, GetAddressOpts } from "./types";

export class OneKeyHardwareWallet implements HardwareWallet {
  readonly name = "OneKey";

  private sdk: any = null;
  private initialized = false;
  private connectId: string | null = null;
  private deviceId: string | null = null;

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
  }

  async disconnect(): Promise<void> {
    this.connectId = null;
    this.deviceId = null;
  }

  /** Prefer on-device PIN/passphrase entry — no custom keypad UI, most secure. */
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
