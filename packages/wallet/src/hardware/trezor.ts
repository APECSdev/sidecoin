// packages/wallet/src/hardware/trezor.ts
//
// Trezor Connect (popup) adapter (read + sign). Browser-based, no WebUSB
// permission required from the host page — Trezor Connect handles device
// selection via its own popup window. The SDK is dynamic-imported so it stays
// out of the main bundle and is never pulled into happy-dom during unit tests.

import type {
  HardwareWallet,
  HardwareAccount,
  GetAddressOpts,
  HardwareSignRequest,
  HardwareSignedTx,
} from "./types";
import { toTrezorSignParams } from "./trezorFormat";
import { Transaction } from "bitcoinjs-lib";

export class TrezorHardwareWallet implements HardwareWallet {
  readonly name = "Trezor";

  private sdk: any = null;
  private initialized = false;
  private connected = false;
  private addressInFlight = false;
  private signInFlight = false;

  private async ensureSdk(): Promise<any> {
    if (this.sdk) return this.sdk;
    const mod = await import("@trezor/connect-web");
    this.sdk = (mod as any).default ?? mod;
    return this.sdk;
  }

  private manifest(): { appUrl: string; email: string } {
    return {
      appUrl: import.meta.env.VITE_TREZOR_APP_URL ?? "wallet.sidecoin.app",
      email: import.meta.env.VITE_TREZOR_CONTACT_EMAIL ?? "hello@sidecoin.app",
    };
  }

  async connect(): Promise<void> {
    const TrezorConnect = await this.ensureSdk();

    if (!this.initialized) {
      await TrezorConnect.init({
        manifest: this.manifest(),
        lazyLoad: true,
      });
      this.initialized = true;
    }

    this.connected = true;
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
      const TrezorConnect = await this.ensureSdk();
      if (!this.connected) {
        throw new Error("Device not connected.");
      }

      const res = await TrezorConnect.getAddress({
        path,
        coin: opts.coin ?? "btc",
        showOnTrezor: opts.showOnDevice ?? false,
      });
      if (!res.success) throw new Error(res.payload?.error ?? String(res.payload));
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
   * Sign a P2WPKH spend on the Trezor device via signTransaction (Trezor
   * format). Trezor Connect opens a popup for the user to confirm on-device.
   * refTxs is populated from req.rawTxs via buildRefTxs — Trezor requires
   * these for full UTXO verification. The txid is computed locally via
   * bitcoinjs-lib since Trezor Connect does not return it.
   */
  async signTransaction(req: HardwareSignRequest): Promise<HardwareSignedTx> {
    if (this.signInFlight) {
      throw new Error("Signing request already in progress.");
    }

    this.signInFlight = true;
    try {
      const TrezorConnect = await this.ensureSdk();
      if (!this.connected) {
        throw new Error("Device not connected.");
      }

      const params = toTrezorSignParams(req);
      const res = await TrezorConnect.signTransaction({
        coin: params.coin,
        inputs: params.inputs,
        outputs: params.outputs,
        refTxs: params.refTxs,
      });
      if (!res.success) throw new Error(res.payload?.error ?? String(res.payload));

      const payload = res.payload as {
        serializedTx?: string;
        signedTx?: string;
        signatures?: string[];
      };
      const hex = payload.serializedTx ?? payload.signedTx;
      if (!hex) {
        throw new Error("Trezor returned no serialized transaction.");
      }
      const txid = Transaction.fromHex(hex).getId();
      return { hex, txid };
    } finally {
      this.signInFlight = false;
    }
  }

  async disconnect(): Promise<void> {
    // No-op — Trezor Connect manages its own popup/iframe lifecycle.
    // We clear the connected flag so subsequent calls require an explicit
    // reconnect, matching OneKey's disconnect behavior. The SDK stays
    // initialized; calling dispose() would destroy the popup infrastructure
    // entirely and require a full re-init on next connect.
    console.log("[Trezor] disconnect called — no-op (SDK stays initialized).");
    this.connected = false;
  }
}
