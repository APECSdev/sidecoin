// apps/mobile/src/__tests__/SendScreen.test.tsx
//
// Tests for the Send screen — ported from apps/wallet/src/__tests__/SendView.test.ts
// and adapted to the React Native port. Covers form rendering, the tabbed
// layout, input binding, button disable states, and the real
// build -> review -> broadcast flow (heavy deps mocked at the module
// boundary).

import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import { SendScreen } from "../screens/SendScreen";

// ---------------------------------------------------------------------------
// Module mocks (declared before importing the component under test)
// ---------------------------------------------------------------------------

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), push: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(cb, [cb]);
  },
}));

// The camera overlay is only mounted while the scanner is open. It now routes
// through the FOSS bridge (../lib/zxingScanner -> a native Activity), so stub
// that bridge: the native module is absent in Jest.
jest.mock("../lib/zxingScanner", () => ({
  isQrScannerAvailable: () => false,
  scanQrCode: async () => null,
}));

jest.mock("../keystore", () => ({
  loadWallet: jest.fn(),
}));

jest.mock("@sidecoin/shared", () => ({
  deriveSigningKey: jest.fn(),
  selectCoins: jest.fn(),
  buildAndSignP2wpkhTransaction: jest.fn(),
}));

jest.mock("../api", () => {
  class ApiError extends Error {
    code: string;
    httpStatus: number;
    constructor(code: string, message: string, httpStatus = 0) {
      super(message);
      this.name = "ApiError";
      this.code = code;
      this.httpStatus = httpStatus;
    }
  }
  return {
    ApiError,
    L1_CHAIN_ID: "signet",
    satsToBtc: (s: bigint) => s.toString(),
    getL1Utxos: jest.fn(),
    broadcastTransaction: jest.fn(),
  };
});

import { loadWallet } from "../keystore";
import {
  deriveSigningKey,
  selectCoins,
  buildAndSignP2wpkhTransaction,
} from "@sidecoin/shared";
import { getL1Utxos, broadcastTransaction, ApiError } from "../api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon about";

const KEY = {
  privateKey: new Uint8Array(32),
  publicKey: new Uint8Array(33),
  address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  scriptPubKey: Uint8Array.from([0x00, 0x14, ...new Array(20).fill(0x11)]),
  path: "m/84'/1'/0'/0/0",
  network: "signet",
  index: 0,
};

const READ_UTXO = {
  chainId: "signet",
  address: KEY.address,
  txid: "a".repeat(64),
  vout: 0,
  valueSats: 1_000_000n,
  scriptPubKey: "0014" + "11".repeat(20),
  confirmations: 200,
  blockHeight: 100,
  isCoinbase: false,
};

const SELECTION = {
  selectedUtxos: [],
  feeSatoshis: 141n,
  changeSatoshis: 899_859n,
  hasChange: true,
  totalInputSatoshis: 1_000_000n,
  numOutputs: 2,
};

const SIGNED = {
  hex: "02000000000101" + "00".repeat(50),
  txid: "f".repeat(64),
  vsize: 141,
  feeSatoshis: 141n,
  changeSatoshis: 899_859n,
  totalInputSatoshis: 1_000_000n,
  hasChange: true,
};

const DEST = "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3";

const mockLoadWallet = loadWallet as jest.Mock;
const mockDeriveSigningKey = deriveSigningKey as jest.Mock;
const mockSelectCoins = selectCoins as jest.Mock;
const mockBuild = buildAndSignP2wpkhTransaction as jest.Mock;
const mockGetL1Utxos = getL1Utxos as jest.Mock;
const mockBroadcast = broadcastTransaction as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fillAndSend(): Promise<void> {
  fireEvent.changeText(screen.getByLabelText("Recipient Address"), DEST);
  fireEvent.changeText(screen.getByLabelText("Amount (eCash)"), "0.005");
  fireEvent.press(screen.getByText("Review Transaction"));
  await waitFor(() => {
    expect(mockGetL1Utxos).toHaveBeenCalled();
  });
}

function pressTab(id: "simple" | "advanced" | "review"): void {
  fireEvent.press(screen.getByTestId(`send-tab-${id}`));
}

function pressBroadcast(): void {
  fireEvent.press(screen.getByText("Broadcast"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadWallet.mockResolvedValue({
    version: 1,
    network: "signet",
    mnemonic: VALID_MNEMONIC,
    createdAt: 0,
  });
  mockDeriveSigningKey.mockReturnValue(KEY);
  mockGetL1Utxos.mockResolvedValue({
    chainId: "signet",
    address: KEY.address,
    utxos: [READ_UTXO],
    truncated: false,
  });
  mockSelectCoins.mockReturnValue(SELECTION);
  mockBuild.mockReturnValue(SIGNED);
  mockBroadcast.mockResolvedValue({
    chainId: "signet",
    txid: SIGNED.txid,
    accepted: true,
    broadcastAt: 123,
  });
});

// ---------------------------------------------------------------------------
// Static rendering / binding
// ---------------------------------------------------------------------------

describe("SendScreen", () => {
  it("should render the 'Send eCash' heading", () => {
    render(<SendScreen />);
    expect(screen.getByText("Send eCash")).toBeTruthy();
  });

  it("should render L1 wallet context", () => {
    render(<SendScreen />);
    expect(screen.getByText("L1 Wallet")).toBeTruthy();
    expect(screen.getByText("Local signing")).toBeTruthy();
  });

  it("should render Simple, Advanced and Review tabs", () => {
    render(<SendScreen />);
    expect(screen.getAllByText("Simple").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Advanced").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0);
  });

  it("should render the recipient address input", () => {
    render(<SendScreen />);
    expect(screen.getByLabelText("Recipient Address")).toBeTruthy();
  });

  it("should render the amount input", () => {
    render(<SendScreen />);
    expect(screen.getByLabelText("Amount (eCash)")).toBeTruthy();
  });

  it("should render the Review Transaction button", () => {
    render(<SendScreen />);
    expect(screen.getByText("Review Transaction")).toBeTruthy();
  });

  it("should render fee policy and send safety copy", () => {
    render(<SendScreen />);
    expect(screen.getByText("Fee policy")).toBeTruthy();
    expect(screen.getByText("2 szats/vB")).toBeTruthy();
    expect(screen.getByText("Send safety")).toBeTruthy();
    expect(
      screen.getByText("Broadcast happens only after review."),
    ).toBeTruthy();
  });

  it("should disable the Review Transaction button when address is empty", () => {
    render(<SendScreen />);
    fireEvent.press(screen.getByText("Review Transaction"));
    expect(mockGetL1Utxos).not.toHaveBeenCalled();
  });

  it("should enable the Review Transaction button when both fields are filled", async () => {
    render(<SendScreen />);
    fireEvent.changeText(screen.getByLabelText("Recipient Address"), DEST);
    fireEvent.changeText(screen.getByLabelText("Amount (eCash)"), "1.0");
    fireEvent.press(screen.getByText("Review Transaction"));
    await waitFor(() => {
      expect(mockGetL1Utxos).toHaveBeenCalled();
    });
  });

  it("should bind the address input value", () => {
    render(<SendScreen />);
    const input = screen.getByLabelText("Recipient Address");
    fireEvent.changeText(input, "bc1qtest123");
    expect(screen.getByLabelText("Recipient Address").props.value).toBe(
      "bc1qtest123",
    );
  });

  it("should bind the amount input value", () => {
    render(<SendScreen />);
    const input = screen.getByLabelText("Amount (eCash)");
    fireEvent.changeText(input, "0.001");
    expect(screen.getByLabelText("Amount (eCash)").props.value).toBe("0.001");
  });

  it("should show the PRO Coin Control preview on the Advanced tab", () => {
    render(<SendScreen />);
    pressTab("advanced");

    expect(screen.getByText("Advanced send tools")).toBeTruthy();
    expect(screen.getByText("Coin Control")).toBeTruthy();
    expect(screen.getByText("Manual UTXO selection preview")).toBeTruthy();
    expect(screen.getByText("Sidecoin PRO required")).toBeTruthy();
  });

  it("should render the richer Coin Control preview rows", () => {
    render(<SendScreen />);
    pressTab("advanced");

    expect(screen.getAllByText("Confirmations").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Label").length).toBeGreaterThan(0);
    expect(screen.getByText("Primary receive")).toBeTruthy();
    expect(screen.getByText("Thunder deposit change")).toBeTruthy();
    expect(screen.getByText("Small coin")).toBeTruthy();
  });

  it("should show Coin Control as locked for the Basic entitlement state", () => {
    render(<SendScreen />);
    pressTab("advanced");

    expect(screen.getByText("Locked")).toBeTruthy();
    expect(screen.getByText("Unlock advanced Coin Control")).toBeTruthy();
    expect(screen.getByText("Upgrade to PRO")).toBeTruthy();
  });

  it("should make Coin Control controls preview-only and disabled", () => {
    render(<SendScreen />);
    pressTab("advanced");

    expect(screen.getByText("Select all")).toBeTruthy();
    expect(screen.getByText("Clear")).toBeTruthy();
    expect(screen.getByText("Use selected coins")).toBeTruthy();
    expect(screen.getByText("Preview-only safety note")).toBeTruthy();
  });

  it("should show an empty review state before a transaction is built", () => {
    render(<SendScreen />);
    pressTab("review");

    expect(screen.getByText("No transaction built yet")).toBeTruthy();
    expect(screen.getByText("Open Simple Send")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Build -> review -> broadcast flow
  // -------------------------------------------------------------------------

  it("builds and signs on submit, showing the txid and a Broadcast button", async () => {
    render(<SendScreen />);
    await fillAndSend();

    expect(mockDeriveSigningKey).toHaveBeenCalledWith(
      VALID_MNEMONIC,
      "signet",
      0,
    );
    expect(mockGetL1Utxos).toHaveBeenCalledWith(KEY.address, {}, "signet");
    expect(mockSelectCoins).toHaveBeenCalled();
    expect(mockBuild).toHaveBeenCalled();
    expect(
      screen.getByText("Signed locally, ready to broadcast"),
    ).toBeTruthy();
    expect(screen.getByText(SIGNED.txid)).toBeTruthy();
    expect(screen.getByText("Broadcast")).toBeTruthy();
  });

  it("passes the recipient, amount and selection fee to the builder", async () => {
    render(<SendScreen />);
    await fillAndSend();

    const args = mockBuild.mock.calls[0][0];
    expect(args.toAddress).toBe(DEST);
    expect(args.amountSatoshis).toBe(500_000n); // 0.005 coins
    expect(args.feeSatoshis).toBe(SELECTION.feeSatoshis);
    expect(args.changeScriptPubKey).toBe(KEY.scriptPubKey);
    expect(args.signingKeys).toEqual([KEY]);
  });

  it("shows an error and does not build when no wallet exists", async () => {
    mockLoadWallet.mockResolvedValue(null);
    render(<SendScreen />);
    fireEvent.changeText(screen.getByLabelText("Recipient Address"), DEST);
    fireEvent.changeText(screen.getByLabelText("Amount (eCash)"), "0.005");
    fireEvent.press(screen.getByText("Review Transaction"));

    await waitFor(() => {
      expect(screen.getByText(/No wallet/)).toBeTruthy();
    });
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it("shows an error for an invalid amount before any network call", async () => {
    render(<SendScreen />);
    fireEvent.changeText(screen.getByLabelText("Recipient Address"), DEST);
    fireEvent.changeText(screen.getByLabelText("Amount (eCash)"), "abc");
    fireEvent.press(screen.getByText("Review Transaction"));

    await waitFor(() => {
      expect(screen.getByText(/Invalid amount/)).toBeTruthy();
    });
    expect(mockGetL1Utxos).not.toHaveBeenCalled();
  });

  it("refuses to build from a truncated UTXO set", async () => {
    mockGetL1Utxos.mockResolvedValue({
      chainId: "signet",
      address: KEY.address,
      utxos: [READ_UTXO],
      truncated: true,
    });
    render(<SendScreen />);
    await fillAndSend();

    expect(screen.getByText(/truncated/)).toBeTruthy();
    expect(mockSelectCoins).not.toHaveBeenCalled();
  });

  it("surfaces an insufficient-funds error from coin selection", async () => {
    mockSelectCoins.mockImplementation(() => {
      throw new Error("Insufficient funds: cannot cover target plus fee.");
    });
    render(<SendScreen />);
    await fillAndSend();

    expect(screen.getByText(/Insufficient funds/)).toBeTruthy();
    expect(screen.queryByText("Broadcast")).toBeNull();
  });

  it("broadcasts the built transaction and shows the receipt", async () => {
    render(<SendScreen />);
    await fillAndSend();
    pressBroadcast();

    await waitFor(() => {
      expect(mockBroadcast).toHaveBeenCalledWith(
        "signet",
        SIGNED.hex,
        "signet",
      );
    });
    expect(screen.getByText("Broadcast receipt")).toBeTruthy();
    expect(screen.getByText(/accepted/)).toBeTruthy();
    expect(screen.getByText(SIGNED.txid)).toBeTruthy();
  });

  it("surfaces a broadcast ApiError with its code", async () => {
    mockBroadcast.mockRejectedValue(
      new ApiError("rejected", "transaction rejected by node", 422),
    );
    render(<SendScreen />);
    await fillAndSend();
    pressBroadcast();

    await waitFor(() => {
      expect(screen.getByText(/rejected/)).toBeTruthy();
    });
  });
});
