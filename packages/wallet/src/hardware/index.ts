// packages/wallet/src/hardware/index.ts
//
// Barrel + factory for hardware wallet adapters.

export * from "./types";
export * from "./network";
export { toTrezorSignParams } from "./trezorFormat";
export type {
  TrezorSignParams,
  TrezorFormatInput,
  TrezorFormatOutput,
  TrezorFormatChangeOutput,
} from "./trezorFormat";
export { OneKeyHardwareWallet } from "./onekey";
export { LedgerHardwareWallet } from "./ledger";
export { TrezorHardwareWallet } from "./trezor";

import type { HardwareWallet, HardwareDeviceKind } from "./types";
import { OneKeyHardwareWallet } from "./onekey";
import { LedgerHardwareWallet } from "./ledger";
import { TrezorHardwareWallet } from "./trezor";

/** Instantiate a hardware wallet adapter by device kind. */
export function makeWallet(kind: HardwareDeviceKind): HardwareWallet {
  switch (kind) {
    case "onekey":
      return new OneKeyHardwareWallet();
    case "ledger":
      return new LedgerHardwareWallet();
    case "trezor":
      return new TrezorHardwareWallet();
  }
}
