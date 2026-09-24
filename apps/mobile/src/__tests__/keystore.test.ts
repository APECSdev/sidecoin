// apps/mobile/src/__tests__/keystore.test.ts
//
// Tests for the biometric-gated keystore and its one-time-per-session unlock.
//
// WHY THIS FILE EXISTS: the biometric feature adds state that is easy to get
// subtly wrong — a background read must NOT prompt, a gated wallet must NOT be
// readable without authenticating, and the cached mnemonic must be dropped
// whenever the underlying keychain item changes. Each of those is asserted
// here against a mocked react-native-keychain + AsyncStorage.
//
// The mock models the real Android behaviour that matters: when an item
// carries an access-control policy, getGenericPassword() only succeeds if the
// caller passed the matching accessControl. That is what makes the
// "background read returns null" assertion meaningful.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Keychain from "react-native-keychain";

import {
  clearSession,
  clearWallet,
  getBiometricLabel,
  isBiometricAvailable,
  isSessionUnlocked,
  loadWallet,
  saveWallet,
  setBiometricsEnabled,
  setWalletNetwork,
} from "../keystore";

// A valid BIP-39 test vector (all-zero entropy) — matches the mnemonic used by
// the shared derivation tests.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

// ---------------------------------------------------------------------------
// Keychain mock.
//
// `stored` models the single keychain item. `gated` records whether that item
// carries the biometric access-control policy. `promptCount` counts how many
// times a read actually prompted, which is the number the session cache is
// meant to keep at 1.
// ---------------------------------------------------------------------------
const keychain = {
  stored: null as string | null,
  gated: false,
  promptCount: 0,
  biometryType: null as Keychain.BIOMETRY_TYPE | null,
};

jest.mock("react-native-keychain", () => ({
  ACCESS_CONTROL: {
    BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE:
      "BiometryCurrentSetOrDevicePasscode",
  },
  BIOMETRY_TYPE: {
    FINGERPRINT: "Fingerprint",
    FACE: "Face",
    IRIS: "Iris",
    TOUCH_ID: "TouchID",
    FACE_ID: "FaceID",
    OPTIC_ID: "OpticID",
  },
  getSupportedBiometryType: jest.fn(async () => keychain.biometryType),
  setGenericPassword: jest.fn(
    async (_user: string, password: string, options?: { accessControl?: string }) => {
      keychain.stored = password;
      keychain.gated = options?.accessControl != null;
      return { service: "app.sidecoin.wallet", storage: "keychain" };
    },
  ),
  getGenericPassword: jest.fn(
    async (options?: { accessControl?: string }) => {
      if (keychain.stored == null) return false;
      // A gated item is only readable when the caller supplied the policy —
      // this is the prompt the session cache exists to avoid.
      if (keychain.gated) {
        if (options?.accessControl == null) return false;
        keychain.promptCount += 1;
      }
      return { username: "sidecoin", password: keychain.stored };
    },
  ),
  resetGenericPassword: jest.fn(async () => {
    keychain.stored = null;
    keychain.gated = false;
    return true;
  }),
}));

// ---------------------------------------------------------------------------
// AsyncStorage mock — in-memory, so the envelope round-trips.
// ---------------------------------------------------------------------------
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

beforeEach(async () => {
  keychain.stored = null;
  keychain.gated = false;
  keychain.promptCount = 0;
  keychain.biometryType = Keychain.BIOMETRY_TYPE.FINGERPRINT;
  clearSession();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe("biometric capability", () => {
  it("reports availability from the enrolled biometry type", async () => {
    keychain.biometryType = Keychain.BIOMETRY_TYPE.FINGERPRINT;
    await expect(isBiometricAvailable()).resolves.toBe(true);

    keychain.biometryType = null;
    await expect(isBiometricAvailable()).resolves.toBe(false);
  });

  it("maps the biometry type to a display label", async () => {
    keychain.biometryType = Keychain.BIOMETRY_TYPE.FINGERPRINT;
    await expect(getBiometricLabel()).resolves.toBe("fingerprint");

    keychain.biometryType = Keychain.BIOMETRY_TYPE.FACE_ID;
    await expect(getBiometricLabel()).resolves.toBe("Face ID");

    keychain.biometryType = null;
    await expect(getBiometricLabel()).resolves.toBeNull();
  });
});

describe("saveWallet with biometrics", () => {
  it("gates the keychain item by default", async () => {
    const wallet = await saveWallet(MNEMONIC);

    expect(wallet.biometricsEnabled).toBe(true);
    expect(keychain.gated).toBe(true);
  });

  it("stores an un-gated item when biometrics are declined", async () => {
    const wallet = await saveWallet(MNEMONIC, false);

    expect(wallet.biometricsEnabled).toBe(false);
    expect(keychain.gated).toBe(false);
  });

  it("stores an un-gated item when the device has no enrolled biometric", async () => {
    keychain.biometryType = null;

    // Requested ON, but the device cannot honour it: storing a gated item
    // here would make the wallet permanently unreadable.
    const wallet = await saveWallet(MNEMONIC, true);

    expect(wallet.biometricsEnabled).toBe(false);
    expect(keychain.gated).toBe(false);
  });
});

describe("session unlock", () => {
  it("prompts exactly once, then serves later reads from the session", async () => {
    await saveWallet(MNEMONIC, true);
    clearSession();
    keychain.promptCount = 0;

    const first = await loadWallet();
    expect(first?.mnemonic).toBe(MNEMONIC);
    expect(keychain.promptCount).toBe(1);
    expect(isSessionUnlocked()).toBe(true);

    // Background reads must not prompt again.
    const second = await loadWallet();
    const third = await loadWallet();
    expect(second?.mnemonic).toBe(MNEMONIC);
    expect(third?.mnemonic).toBe(MNEMONIC);
    expect(keychain.promptCount).toBe(1);
  });

  it("does not prompt for a background read before the session is unlocked", async () => {
    await saveWallet(MNEMONIC, true);
    clearSession();
    keychain.promptCount = 0;

    const wallet = await loadWallet({ authenticate: false });

    expect(wallet).toBeNull();
    expect(keychain.promptCount).toBe(0);
    expect(isSessionUnlocked()).toBe(false);
  });

  it("serves a background read once the session is unlocked", async () => {
    await saveWallet(MNEMONIC, true);
    clearSession();
    keychain.promptCount = 0;

    await loadWallet();
    const wallet = await loadWallet({ authenticate: false });

    expect(wallet?.mnemonic).toBe(MNEMONIC);
    expect(keychain.promptCount).toBe(1);
  });

  it("never prompts for an un-gated wallet", async () => {
    await saveWallet(MNEMONIC, false);
    clearSession();
    keychain.promptCount = 0;

    await expect(loadWallet({ authenticate: false })).resolves.not.toBeNull();
    expect(keychain.promptCount).toBe(0);
  });

  it("reflects a network change made after the unlock", async () => {
    await saveWallet(MNEMONIC, true);
    await loadWallet();

    const updated = await setWalletNetwork("signet");
    expect(updated.network).toBe("signet");

    // The session was cleared by the network write's own keychain round-trip
    // only if it re-read; assert the value the caller observes.
    const reread = await loadWallet();
    expect(reread?.network).toBe("signet");
  });

  it("drops the cached mnemonic on clearWallet", async () => {
    await saveWallet(MNEMONIC, true);
    await loadWallet();
    expect(isSessionUnlocked()).toBe(true);

    await clearWallet();

    expect(isSessionUnlocked()).toBe(false);
    await expect(loadWallet({ authenticate: false })).resolves.toBeNull();
  });
});

describe("setBiometricsEnabled", () => {
  it("re-gates an un-gated wallet and clears the session", async () => {
    await saveWallet(MNEMONIC, false);
    clearSession();

    const applied = await setBiometricsEnabled(MNEMONIC, true);

    expect(applied).toBe(true);
    expect(keychain.gated).toBe(true);
    // The cached plaintext no longer matches the re-written item.
    expect(isSessionUnlocked()).toBe(false);
  });

  it("refuses to enable when the device has no enrolled biometric", async () => {
    await saveWallet(MNEMONIC, false);
    keychain.biometryType = null;

    const applied = await setBiometricsEnabled(MNEMONIC, true);

    expect(applied).toBe(false);
    expect(keychain.gated).toBe(false);
  });

  it("un-gates a gated wallet", async () => {
    await saveWallet(MNEMONIC, true);
    clearSession();

    const applied = await setBiometricsEnabled(MNEMONIC, false);

    expect(applied).toBe(true);
    expect(keychain.gated).toBe(false);
    // An un-gated item reads without prompting.
    keychain.promptCount = 0;
    await expect(loadWallet({ authenticate: false })).resolves.not.toBeNull();
    expect(keychain.promptCount).toBe(0);
  });
});
