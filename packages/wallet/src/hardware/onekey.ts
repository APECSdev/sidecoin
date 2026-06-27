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
