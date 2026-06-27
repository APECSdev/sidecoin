// packages/wallet/src/hardware/trezor.ts
//
// Trezor Connect WebUSB adapter (read + sign).
//
//  !!!  HARDWARE-UNVERIFIED  !!!
//  At time of writing the project has NO physical Trezor device to test
//  against (OneKey devices cannot exercise @trezor/connect-web — see project
//  handoff). This adapter compiles, type-checks, and passes mocked unit tests,
//  but its on-device behavior (address derivation, sign flow, change
//  script_type, signet coin id) is UNVERIFIED. Do NOT ship to production
//  without confirming on a real Trezor Safe 3 / Safe 5 / Model T.
//
// @trezor/connect-web runs its heavy core (incl. the Solana SDK it bundles) in
// a Trezor popup/iframe, so the Solana code does NOT enter the wallet's main
// bundle. We still dynamic-import connect-web inside methods only, so the thin
// wrapper is lazily chunked away from the app's critical path.

import type {
  HardwareWallet,
  HardwareAccount,
  GetAddressOpts,
  HardwareSignRequest,
  HardwareSignedTx,
} from "./types";
import { toTrezorSignParams } from "./trezorFormat";
import { coinIdFor } from "./network";
import type { NetworkId } from "@sidecoin/shared";

export class TrezorHardwareWallet implements HardwareWallet {
  readonly name = "Trezor";

  private manifestDone = false;
  private addressInFlight = false;
  private signInFlight = false;

  /**
   * Trezor Connect requires a manifest before any device-touching call. These
   * values identify the app to Trezor's popup; replace with real production
   * contact info before mainnet.
   */
  private async ensureManifest(): Promise<any> {
    const mod = await import("@trezor/connect-web");
    const TrezorConnect = (mod as any).default ?? mod;
    if (!this.manifestDone) {
      await TrezorConnect.manifest({
        appName: "Sidecoin Wallet",
        appUrl: "https://sidecoin.app",
        email: "dev@sidecoin.app",
      });
      this.manifestDone = true;
    }
    return TrezorConnect;
  }

  async connect(): Promise<void> {
    // Trezor Connect is stateless between calls — there is no persistent
    // session to open. The first device-touching call (getAddress) triggers
    // the WebUSB picker inside the Trezor popup, which itself satisfies the
    // Chromium user-gesture requirement. We probe with a no-op publicKey fetch
    // at the wallet's default path so a connection error surfaces here.
    const TrezorConnect = await this.ensureManifest();
    // init is required for connect-web before any call.
    try {
      await TrezorConnect.init({
        lazyLoad: false,
        manifest: {
          appName: "Sidecoin Wallet",
          appUrl: "https://sidecoin.app",
          email: "dev@sidecoin.app",
        },
      });
    } catch {
      // init may throw if already initialized (e.g. HMR); safe to ignore.
    }
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
      const TrezorConnect = await this.ensureManifest();
      const res = await TrezorConnect.getAddress({
        path,
        coin: opts.coin ?? "btc",
        showOnTrezor: opts.showOnDevice ?? false,
      });
      if (!res.success) throw new Error(res.payload.error);
      return {
        path,
        address: res.payload.address,
        // Trezor getAddress does not return the raw pubkey; leave empty — the
        // signing path derives the script from address_n, not from this field.
        publicKey: "",
      };
    } finally {
      this.addressInFlight = false;
    }
  }

  /**
   * Sign a P2WPKH spend on the Trezor device via signTransaction.
   *
   * Uses the shared Trezor-format converter (same shape OneKey uses).
   * SegWit v0 inputs sign from amount + address_n, so no refTxs are passed.
   */
  async signTransaction(req: HardwareSignRequest): Promise<HardwareSignedTx> {
    if (this.signInFlight) {
      throw new Error("Signing request already in progress.");
    }
    this.signInFlight = true;
    try {
      const TrezorConnect = await this.ensureManifest();
      const params = toTrezorSignParams(req);
      const res = await TrezorConnect.signTransaction(params as any);
      if (!res.success) throw new Error(res.payload.error);

      const payload = res.payload as {
        serializedTx?: string;
        signatures?: string[];
        txid?: string;
      };
      if (!payload.serializedTx) {
        throw new Error("Trezor returned no serialized transaction.");
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
    // Stateless between calls — nothing to close. (TrezorConnect.dispose()
    // tears down the popup iframe; we leave it alive so reconnect is instant.)
    return;
  }
}

// coinIdFor is re-exported here only to keep the network-aware coin id visible
// at the adapter boundary for future per-network overrides; not used directly.
void coinIdFor;

// Suppress unused type import warnings in strict builds.
export type { NetworkId };
