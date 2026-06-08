// packages/wallet/src/hardware/types.ts

export interface HardwareAccount {
  path: string;
  address: string;
  publicKey: string;
}

/** Read-only surface for now. Signing is deliberately omitted until the
 *  fork's network params are confirmed against BitWindow. */
export interface HardwareWallet {
  readonly name: string;
  connect(): Promise<void>;
  getAddress(path: string, opts?: GetAddressOpts): Promise<HardwareAccount>;
  disconnect(): Promise<void>;
}

export interface GetAddressOpts {
  /** OneKey coin id. "btc" mainnet app; may need "test" for signet — TBD. */
  coin?: string;
  /** Render the address on the device screen for visual confirmation. */
  showOnDevice?: boolean;
}
