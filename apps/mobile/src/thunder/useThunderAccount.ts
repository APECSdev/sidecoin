// apps/mobile/src/thunder/useThunderAccount.ts
//
// Live Thunder account state for the platform screens. Syncs on mount
// (balance, history, escrow) and exposes the current receive address + its
// deposit wrapper. The mnemonic is loaded from the keychain per refresh and
// held only inside the async calls — nothing secret is kept in React state.

import { useCallback, useEffect, useState } from "react";

import { loadWallet } from "../keystore";
import {
  syncThunderAccount,
  thunderDepositString,
  thunderReceiveAddress,
  type ThunderAccount,
  type ThunderAccountState,
} from "./service";

/** The mobile app is single-wallet; the local Thunder stores key off this. */
export const PRIMARY_WALLET_ID = "primary";

export interface ThunderReceiveInfo {
  address: string;
  index: number;
  /** `s9_<addr>_<checksum>` — what the M5 deposit flow shows. */
  depositString: string;
}

export interface ThunderAccountHook {
  state: ThunderAccountState | null;
  receive: ThunderReceiveInfo | null;
  error: string | null;
  syncing: boolean;
  refresh: () => Promise<void>;
}

export function useThunderAccount(enabled: boolean): ThunderAccountHook {
  const [state, setState] = useState<ThunderAccountState | null>(null);
  const [receive, setReceive] = useState<ThunderReceiveInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setSyncing(true);
    try {
      const wallet = await loadWallet({ authenticate: false });
      if (!wallet) {
        setError("No wallet on this device.");
        return;
      }
      const account: ThunderAccount = {
        walletId: PRIMARY_WALLET_ID,
        l1Network: wallet.network,
      };
      const synced = await syncThunderAccount(wallet.mnemonic, account);
      setState(synced);
      const r = await thunderReceiveAddress(wallet.mnemonic, account, false);
      setReceive({
        address: r.address,
        index: r.index,
        depositString: thunderDepositString(r.address),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, receive, error, syncing, refresh };
}
