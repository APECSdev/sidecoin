// apps/wallet/src/__tests__/PlatformDetailView.test.ts

import { beforeEach, describe, it, expect, vi } from "vitest";
import { bytesToHex } from "@noble/hashes/utils";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createWebHashHistory } from "vue-router";
import PlatformDetailView from "../views/PlatformDetailView.vue";
import SidechainsView from "../views/SidechainsView.vue";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    getCoinNewsFeeds: vi.fn(),
    getCoinNewsPosts: vi.fn(),
    getWalletBalance: vi.fn(),
    getDeposits: vi.fn(),
    getL1Utxos: vi.fn(),
    getCtip: vi.fn(),
    broadcastTransaction: vi.fn(),
  };
});

import {
  getCoinNewsFeeds,
  getCoinNewsPosts,
  getWalletBalance,
  getDeposits,
  getL1Utxos,
  getCtip,
  broadcastTransaction,
} from "../api";
import { deriveSigningKey } from "@sidecoin/shared";

const mockGetCoinNewsFeeds = vi.mocked(getCoinNewsFeeds);
const mockGetCoinNewsPosts = vi.mocked(getCoinNewsPosts);
const mockGetWalletBalance = vi.mocked(getWalletBalance);
const mockGetDeposits = vi.mocked(getDeposits);
const mockGetL1Utxos = vi.mocked(getL1Utxos);
const mockGetCtip = vi.mocked(getCtip);
const mockBroadcastTransaction = vi.mocked(broadcastTransaction);

// The standard all-"abandon" BIP-39 test mnemonic. Its pinned Thunder
// (index-1) address comes from packages/shared derivation vectors:
// k81Deknpsx5Zi6WxUkeMQYrohvt → deposit wrapper s9_…_fbbfdc.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon about";

/** Seed the REAL keystore (localStorage) with the pinned test wallet. */
function seedTestWallet() {
  localStorage.setItem(
    "sidecoin.wallet.v1",
    JSON.stringify({
      version: 1,
      network: "betanet",
      mnemonic: TEST_MNEMONIC,
      createdAt: 0,
    }),
  );
}

const EMPTY_THUNDER_BALANCE = {
  slot: 9,
  chainId: "thunder",
  address: "k81Deknpsx5Zi6WxUkeMQYrohvt",
  source: "indexed" as const,
  provisioned: true,
  totalSats: 0n,
  depositCount: 0,
  truncated: false,
  seen: false,
  updatedAtHeight: null,
  note: "indexed balance from upstream (sats)",
};

const EMPTY_THUNDER_DEPOSITS = {
  slot: 9,
  chainId: "thunder",
  provisioned: true,
  deposits: [],
  nextCursor: null,
};


async function mountPlatform(path: string) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: "/platforms", name: "platforms", component: SidechainsView },
      { path: "/platforms/:platformId", name: "platform-detail", component: PlatformDetailView },
      { path: "/pro", name: "pro", component: { template: "<div />" } },
    ],
  });

  router.push(path);
  await router.isReady();

  return mount(PlatformDetailView, {
    global: {
      plugins: [router],
    },
  });
}

describe("PlatformDetailView.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetWalletBalance.mockResolvedValue(EMPTY_THUNDER_BALANCE);
    mockGetDeposits.mockResolvedValue(EMPTY_THUNDER_DEPOSITS);
    mockGetL1Utxos.mockResolvedValue({
      chainId: "signet",
      address: "tb1qtest",
      utxos: [],
      truncated: false,
    });
    mockGetCoinNewsFeeds.mockResolvedValue([
      {
        id: "us-weekly",
        name: "US Weekly",
        language: "en",
        enabled: true,
        post_count: 1,
      },
      {
        id: "japan-weekly",
        name: "Japan Weekly",
        language: "ja",
        enabled: true,
        post_count: 1,
      },
    ]);
    mockGetCoinNewsPosts.mockImplementation(async (feedId: string) => ({
      feed: {
        id: feedId,
        name: feedId === "japan-weekly" ? "Japan Weekly" : "US Weekly",
      },
      posts: [
        {
          id: `post_${feedId}`,
          title: feedId === "japan-weekly" ? "Live API Japan post" : "Live API wallet post",
          body: null,
          link: null,
          author: null,
          created_at: 1781568001,
          fee_sats: "1108",
          flag: null,
          txid: "a".repeat(64),
          status: "confirmed",
        },
      ],
      next_cursor: null,
    }));
  });


  it("renders Thunder as a dedicated platform page", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    expect(wrapper.text()).toContain("Thunder Network");
    expect(wrapper.text()).toContain("Platform · Slot 9");
    expect(wrapper.text()).toContain("Overview");
    expect(wrapper.text()).toContain("Parent Chain");
    expect(wrapper.text()).toContain("Activity");
    expect(wrapper.text()).toContain("Payments");
  });

  it("renders horizontal feature tabs for Basic platforms", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    expect(wrapper.text()).toContain("Payments");
    expect(wrapper.text()).toContain("Channels");
    expect(wrapper.text()).toContain("Liquidity");
  });

  it("renders Thunder-specific overview actions", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    expect(wrapper.text()).toContain("Create invoice");
    expect(wrapper.text()).toContain("Send payment");
    expect(wrapper.text()).toContain("Channel liquidity");
    expect(wrapper.text()).toContain("Liquidity planner");
  });

  it("can switch to the Thunder Payments tab", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    const payments = wrapper.findAll("button").find((b) => b.text() === "Payments");
    expect(payments).toBeDefined();

    await payments!.trigger("click");

    expect(wrapper.text()).toContain("Thunder Payments");
    expect(wrapper.text()).toContain("Send Payment");
    expect(wrapper.text()).toContain("Create Invoice");
    expect(wrapper.text()).toContain("Route estimate");
    expect(wrapper.text()).toContain("No live Thunder payments are indexed yet.");
    expect(wrapper.text()).not.toContain("thunder-pay-7f4a");
  });

  it("can switch to the Thunder Channels tab", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    const channels = wrapper.findAll("button").find((b) => b.text() === "Channels");
    expect(channels).toBeDefined();

    await channels!.trigger("click");

    expect(wrapper.text()).toContain("Thunder Channels");
    expect(wrapper.text()).toContain("Open channels");
    expect(wrapper.text()).toContain("Inbound liquidity");
    expect(wrapper.text()).toContain("Outbound liquidity");
    expect(wrapper.text()).toContain("Average health");
    expect(wrapper.text()).toContain("No live Thunder channels are indexed yet.");
    expect(wrapper.text()).not.toContain("routing-peer-01");
    expect(wrapper.text()).not.toContain("merchant-hub");
    expect(wrapper.text()).not.toContain("backup-route");
  });

  it("can switch to the Thunder Liquidity tab", async () => {
    const wrapper = await mountPlatform("/platforms/thunder");
    const liquidity = wrapper.findAll("button").find((b) => b.text() === "Liquidity");
    expect(liquidity).toBeDefined();

    await liquidity!.trigger("click");

    expect(wrapper.text()).toContain("Liquidity Planner");
    expect(wrapper.text()).toContain("Available to send");
    expect(wrapper.text()).toContain("Available to receive");
    expect(wrapper.text()).toContain("Route coverage");
    expect(wrapper.text()).toContain("Suggested action");
    expect(wrapper.text()).toContain("Recommendations");
    expect(wrapper.text()).toContain("No live Thunder liquidity recommendations are indexed yet.");
    expect(wrapper.text()).toContain("No live Thunder liquidity diagnostics are indexed yet.");
    expect(wrapper.text()).not.toContain("Add inbound capacity");
    expect(wrapper.text()).not.toContain("Display-only liquidity view");
  });

  it("renders a clear PRO CTA for gated platforms", async () => {
    const wrapper = await mountPlatform("/platforms/zside");
    expect(wrapper.text()).toContain("Unlock zSide with Sidecoin PRO");
    expect(wrapper.text()).toContain("Platform wallet");
    expect(wrapper.text()).toContain("Historical analysis across platforms");
    expect(wrapper.text()).toContain("Early access to proposed platforms like RISCy");
  });

  it("can switch feature tabs", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const records = wrapper.findAll("button").find((b) => b.text() === "Records");
    expect(records).toBeDefined();

    await records!.trigger("click");
    expect(wrapper.text()).toContain("Manage records");
  });

  it("renders BitNames Contacts and Messages tabs", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    expect(wrapper.text()).toContain("Contacts");
    expect(wrapper.text()).toContain("Messages");
    expect(wrapper.text()).toContain("Live message data not indexed yet");
    expect(wrapper.text()).not.toContain("demo conversation events");
  });

  it("can switch to the BitNames Contacts tab", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const contacts = wrapper.findAll("button").find((b) => b.text() === "Contacts");
    expect(contacts).toBeDefined();

    await contacts!.trigger("click");

    expect(wrapper.text()).toContain("BitNames contacts");
    expect(wrapper.text()).toContain("No live BitNames contacts are indexed yet.");
    expect(wrapper.text()).toContain("No live BitNames contact is selected.");
    expect(wrapper.text()).toContain("Contact profile");
    expect(wrapper.text()).not.toContain("alice.bit");
    expect(wrapper.text()).not.toContain("merchant.bit");
    expect(wrapper.text()).not.toContain("support.bit");
  });

  it("shows an empty BitNames contact state instead of fake contacts", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const contacts = wrapper.findAll("button").find((b) => b.text() === "Contacts");
    expect(contacts).toBeDefined();

    await contacts!.trigger("click");

    expect(wrapper.text()).toContain("No live BitNames contacts are indexed yet.");
    expect(wrapper.text()).not.toContain("alice.bit");
    expect(wrapper.text()).not.toContain("merchant.bit");
    expect(wrapper.text()).not.toContain("support.bit");
  });

  it("can switch directly to the BitMessages tab", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const messages = wrapper.findAll("button").find((b) => b.text() === "Messages");
    expect(messages).toBeDefined();

    await messages!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("BitMessages");
    expect(wrapper.text()).toContain("Live Coin News");
    expect(wrapper.text()).toContain("US Weekly");
    expect(wrapper.text()).toContain("Japan Weekly");
    expect(wrapper.text()).toContain("Date");
    expect(wrapper.text()).toContain("Fee");
    expect(wrapper.text()).toContain("Title");
    expect(wrapper.text()).toContain("Live API Japan post");
    expect(wrapper.text()).toContain("No live BitNames contacts are indexed yet.");
    expect(wrapper.text()).toContain("No live BitNames messages are indexed yet.");
  });

  it("opens the local Coin News OP_RETURN composer from BitMessages", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const messages = wrapper.findAll("button").find((b) => b.text() === "Messages");
    expect(messages).toBeDefined();

    await messages!.trigger("click");
    await flushPromises();

    const broadcast = wrapper
      .findAll("button")
      .find((button) => button.text() === "Broadcast News" && button.attributes("disabled") === undefined);
    expect(broadcast).toBeDefined();

    await broadcast!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Compose Coin News");
    expect(wrapper.text()).toContain("Local OP_RETURN signing");
    expect(wrapper.text()).toContain("Build Signed News Transaction");
    expect(wrapper.text()).toContain("Public and permanent");
  });

  it("opens the local Coin News OP_RETURN composer from the sidebar button", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const messages = wrapper.findAll("button").find((b) => b.text() === "Messages");
    expect(messages).toBeDefined();

    await messages!.trigger("click");
    await flushPromises();

    const sidebarButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Open Feed Composer");
    expect(sidebarButton).toBeDefined();
    expect(sidebarButton!.attributes("disabled")).toBeUndefined();

    await sidebarButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Compose Coin News");
    expect(wrapper.text()).toContain("Local OP_RETURN signing");
    expect(wrapper.text()).toContain("Build Signed News Transaction");
    expect(wrapper.text()).toContain("Public and permanent");
  });


  it("does not render backend warning copy in the BitMessages screenshot UI", async () => {
    const wrapper = await mountPlatform("/platforms/bitnames");
    const messages = wrapper.findAll("button").find((b) => b.text() === "Messages");
    expect(messages).toBeDefined();

    await messages!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("display-only");
    expect(wrapper.text()).not.toContain("no messages leave your wallet");
    expect(wrapper.text()).not.toContain("live messaging is connected");
    expect(wrapper.text()).not.toContain("Messaging preview disabled");
    expect(wrapper.text()).not.toContain("No network calls");
    expect(wrapper.text()).not.toContain("Send disabled");
    expect(wrapper.text()).not.toContain("SupaQt");
  });

  it("renders Elements Plus as a coming-soon platform with Slot TBD", async () => {
    const wrapper = await mountPlatform("/platforms/elementsplus");
    expect(wrapper.text()).toContain("Elements Plus");
    expect(wrapper.text()).toContain("Platform · Slot TBD");
    expect(wrapper.text()).toContain("Coming Soon");
    expect(wrapper.text()).toContain("Unlock Elements Plus with Sidecoin PRO");
  });

  it("shows a not-found state for unknown platforms", async () => {
    const wrapper = await mountPlatform("/platforms/unknown");
    expect(wrapper.text()).toContain("Platform not found");
  });

  it("loads live Thunder balance and credited deposits into the hub", async () => {
    seedTestWallet();
    mockGetWalletBalance.mockResolvedValue({
      ...EMPTY_THUNDER_BALANCE,
      totalSats: 150000n,
      depositCount: 1,
      seen: true,
      updatedAtHeight: 2700,
    });
    mockGetDeposits.mockResolvedValue({
      ...EMPTY_THUNDER_DEPOSITS,
      deposits: [
        {
          slot: 9,
          chainId: "thunder",
          l1Txid: "1a23f9d2455137e63f6dc87f90514ef33258746cebf6fd7ebb6c96416b4cc4eb",
          vout: 0,
          ctipSeq: null,
          address: "k81Deknpsx5Zi6WxUkeMQYrohvt",
          valueSats: 100000n,
          status: "l2_credited",
          confirmations: null,
          firstSeenTs: 1782171004,
          l1ConfirmedTs: null,
          l2CreditedTs: 1782171004,
        },
      ],
    });

    const wrapper = await mountPlatform("/platforms/thunder");
    await flushPromises();

    // Balance is queried for the wallet's own derived Thunder address.
    expect(mockGetWalletBalance).toHaveBeenCalledWith(9, "k81Deknpsx5Zi6WxUkeMQYrohvt");
    expect(mockGetDeposits).toHaveBeenCalledWith(9, {
      address: "k81Deknpsx5Zi6WxUkeMQYrohvt",
      limit: 10,
    });

    // Live indexed balance renders formatted — satsToBtc keeps a minimum
    // of 2 decimals and trims trailing zeros (150000 sats → "0.0015").
    expect(wrapper.text()).toContain("0.0015");
    expect(wrapper.text()).toContain("Indexed balance (height 2700)");

    // The credited deposit feeds the overview activity table.
    expect(wrapper.text()).toContain("Credited on Thunder");
    expect(wrapper.text()).not.toContain("No Thunder deposits yet for your address.");
  });

  it("shows the formatted s9 deposit address in the Parent Chain tab", async () => {
    seedTestWallet();

    const wrapper = await mountPlatform("/platforms/thunder");
    const parentChain = wrapper.findAll("button").find((b) => b.text() === "Parent Chain");
    expect(parentChain).toBeDefined();
    await parentChain!.trigger("click");
    await flushPromises();

    // formatDepositAddress(9, k81Deknpsx5Zi6WxUkeMQYrohvt) — checksum locked
    // in the @sidecoin/shared derivation vectors. The address lives in an
    // input's value (not a text node), so assert on the DOM element.
    const depositInput = wrapper
      .findAll("input")
      .find((i) => (i.element as HTMLInputElement).value === "s9_k81Deknpsx5Zi6WxUkeMQYrohvt_fbbfdc");
    expect(depositInput).toBeDefined();
    expect(wrapper.text()).toContain("In-wallet deposit execution is not wired yet.");
  });

  it("keeps the honest fallback and error banner when Thunder data fails", async () => {
    seedTestWallet();
    mockGetWalletBalance.mockRejectedValue(new Error("upstream down"));
    mockGetDeposits.mockRejectedValue(new Error("upstream down"));

    const wrapper = await mountPlatform("/platforms/thunder");
    await flushPromises();

    expect(wrapper.text()).toContain("Error loading Thunder data");
    expect(wrapper.text()).toContain("upstream down");
    // Balance card falls back to the em-dash placeholder, not a fake zero.
    expect(wrapper.text()).toContain("Live balance data not indexed yet");
  });

  it("builds, reviews, and broadcasts a Thunder deposit end-to-end (mocked)", async () => {
    seedTestWallet();
    // The flow derives the REAL signing key from the seeded mnemonic and
    // matches funding UTXOs by scriptPubKey — use the derived key's script.
    const keyScript = bytesToHex(deriveSigningKey(TEST_MNEMONIC, "betanet", 0).scriptPubKey);
    // Funding UTXO for the deposit (confirmed, spendable).
    mockGetL1Utxos.mockResolvedValue({
      chainId: "betanet",
      address: "tb1qtest",
      utxos: [
        {
          chainId: "betanet",
          address: "tb1qtest",
          txid: "7d10f8714839cf6f840792348ba0b3dbbaabdf9ae28b8c58df0ec306496b6fcc",
          vout: 1,
          valueSats: 900000n,
          scriptPubKey: keyScript,
          isCoinbase: false,
          confirmations: 10,
          blockHeight: 1000,
        },
      ],
      truncated: false,
    });
    mockGetCtip.mockResolvedValue({
      txid: "a4d84730a0857b6e46c1e6e7174bb675bb1b1a9b0419783a4fdacf4c6eade149",
      vout: 0,
      valueSats: 767280000n,
    });
    mockBroadcastTransaction.mockResolvedValue({
      chainId: "signet",
      txid: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      accepted: true,
      broadcastAt: 1,
    });

    const wrapper = await mountPlatform("/platforms/thunder");
    const parentChain = wrapper.findAll("button").find((b) => b.text() === "Parent Chain");
    await parentChain!.trigger("click");
    await flushPromises();

    // Enter the amount and review.
    const amountInput = wrapper.findAll("input").find(
      (i) => (i.element as HTMLInputElement).placeholder === "0.00000000" && !i.attributes().disabled,
    );
    expect(amountInput).toBeDefined();
    await amountInput!.setValue("0.001");

    const reviewBtn = wrapper.findAll("button").find((b) => b.text() === "Review deposit");
    expect(reviewBtn).toBeDefined();
    await reviewBtn!.trigger("click");
    await flushPromises();

    // The seeded wallet's network is betanet — the deposit flow follows it.
    expect(mockGetCtip).toHaveBeenCalledWith("betanet", 9);
    expect(wrapper.text()).toContain("Deposit ready — review before broadcast");
    expect(wrapper.text()).toContain("Deposit0.001");
    expect(wrapper.text()).toContain("szats");

    // Broadcast.
    const broadcastBtn = wrapper.findAll("button").find((b) => b.text() === "Broadcast deposit");
    await broadcastBtn!.trigger("click");
    await flushPromises();

    expect(mockBroadcastTransaction).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(
      "Deposit broadcast: fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    );
    // The review panel clears after broadcast.
    expect(wrapper.text()).not.toContain("Deposit ready — review before broadcast");
  });

  it("surfaces a CTIP fetch failure as a flow error, not a crash", async () => {
    seedTestWallet();
    mockGetCtip.mockRejectedValue(new Error("enforcer unreachable"));

    const wrapper = await mountPlatform("/platforms/thunder");
    const parentChain = wrapper.findAll("button").find((b) => b.text() === "Parent Chain");
    await parentChain!.trigger("click");
    await flushPromises();

    const amountInput = wrapper.findAll("input").find(
      (i) => (i.element as HTMLInputElement).placeholder === "0.00000000" && !i.attributes().disabled,
    );
    await amountInput!.setValue("0.001");
    const reviewBtn = wrapper.findAll("button").find((b) => b.text() === "Review deposit");
    await reviewBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("enforcer unreachable");
  });

  it("rejects a deposit amount below dust with an honest error", async () => {
    seedTestWallet();

    const wrapper = await mountPlatform("/platforms/thunder");
    const parentChain = wrapper.findAll("button").find((b) => b.text() === "Parent Chain");
    await parentChain!.trigger("click");
    await flushPromises();

    const amountInput = wrapper.findAll("input").find(
      (i) => (i.element as HTMLInputElement).placeholder === "0.00000000" && !i.attributes().disabled,
    );
    await amountInput!.setValue("0.000000001"); // 9 decimals — parse error
    const reviewBtn = wrapper.findAll("button").find((b) => b.text() === "Review deposit");
    await reviewBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("more than 8 decimal places");
  });

  it("shows a wallet-setup state and makes no Thunder calls without a key", async () => {

    const wrapper = await mountPlatform("/platforms/thunder");
    await flushPromises();

    expect(mockGetWalletBalance).not.toHaveBeenCalled();
    expect(mockGetDeposits).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      "Wallet setup required — balance appears once key setup is complete.",
    );
  });

  it("does not fetch Thunder data for other platforms", async () => {
    seedTestWallet();

    await mountPlatform("/platforms/zside");
    await flushPromises();

    expect(mockGetWalletBalance).not.toHaveBeenCalled();
    expect(mockGetDeposits).not.toHaveBeenCalled();
  });
});
