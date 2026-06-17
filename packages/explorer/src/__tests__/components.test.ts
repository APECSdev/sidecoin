// packages/explorer/src/__tests__/components.test.ts

import { mount } from "@vue/test-utils";
import { createRouter, createWebHistory } from "vue-router";
import CopyButton from "../components/CopyButton.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorState from "../components/ErrorState.vue";
import HashLink from "../components/HashLink.vue";
import LoadingState from "../components/LoadingState.vue";
import { routes } from "../router";

describe("explorer components", () => {
  it("renders empty state text", () => {
    const wrapper = mount(EmptyState, {
      props: {
        title: "No records",
        message: "Nothing indexed yet.",
      },
    });

    expect(wrapper.text()).toContain("No records");
    expect(wrapper.text()).toContain("Nothing indexed yet.");
  });

  it("renders error state text", () => {
    const wrapper = mount(ErrorState, {
      props: {
        title: "Unavailable",
        message: "Could not load explorer data.",
      },
    });

    expect(wrapper.text()).toContain("SidΞcoin Explorer");
    expect(wrapper.text()).toContain("Unavailable");
    expect(wrapper.text()).toContain("Could not load explorer data.");
  });

  it("renders loading state text", () => {
    const wrapper = mount(LoadingState, {
      props: {
        title: "Loading block",
        message: "Fetching block data.",
      },
    });

    expect(wrapper.text()).toContain("Loading block");
    expect(wrapper.text()).toContain("Fetching block data.");
  });

  it("renders a truncated hash link", async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes,
    });

    router.push("/thunder");
    await router.isReady();

    const value = "a".repeat(64);
    const wrapper = mount(HashLink, {
      props: {
        value,
        chainId: "thunder",
        routeName: "transaction",
        paramName: "txid",
      },
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.text()).toContain("aaaaaaaaaa…aaaaaaaa");
    expect(wrapper.attributes("title")).toBe(value);
    expect(wrapper.find("a").attributes("href")).toBe(`/thunder/tx/${value}`);
  });

  it("copies text with navigator clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const wrapper = mount(CopyButton, {
      props: {
        value: "copy-me",
        label: "Copy value",
      },
    });

    await wrapper.find("button").trigger("click");

    expect(writeText).toHaveBeenCalledWith("copy-me");
    expect(wrapper.text()).toContain("Copied");
  });
});

describe("chain dashboard labels", () => {
  it("uses live index labels for live chains", async () => {
    vi.resetModules();

    vi.doMock("../api", () => ({
      getExplorerStatus: vi.fn(async () => ({
        chainId: "l1",
        network: "ecash-signet",
        latestHeight: 1075,
        latestBlockHash: "a".repeat(64),
        indexedTransactions: 1,
        mempoolTransactions: 0,
        updatedAt: "2026-06-16T13:20:01.000Z",
      })),
      getLatestBlocks: vi.fn(async () => []),
      getLatestTransactions: vi.fn(async () => []),
    }));

    const { default: ChainView } = await import("../views/ChainView.vue");

    const router = createRouter({
      history: createWebHistory(),
      routes,
    });

    router.push("/l1");
    await router.isReady();

    const wrapper = mount(ChainView, {
      global: {
        plugins: [router],
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Live API index");
    });

    expect(wrapper.text()).toContain("Latest block transaction count");
    expect(wrapper.text()).toContain("Confirmed-only index");
    expect(wrapper.text()).not.toContain("No live rows shown");

    vi.doUnmock("../api");
  });

  it("shows coming soon copy and empty rows for non-indexed chains", async () => {
    vi.resetModules();

    const getExplorerStatus = vi.fn(async () => ({
      chainId: "zside",
      network: "ecash-signet",
      latestHeight: 0,
      latestBlockHash: "",
      indexedTransactions: 0,
      mempoolTransactions: 0,
      updatedAt: "",
    }));
    const getLatestBlocks = vi.fn(async () => []);
    const getLatestTransactions = vi.fn(async () => []);

    vi.doMock("../api", () => ({
      getExplorerStatus,
      getLatestBlocks,
      getLatestTransactions,
    }));

    const { default: ChainView } = await import("../views/ChainView.vue");

    const router = createRouter({
      history: createWebHistory(),
      routes,
    });

    router.push("/zside");
    await router.isReady();

    const wrapper = mount(ChainView, {
      global: {
        plugins: [router],
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Coming soon");
    });

    expect(wrapper.text()).toContain("This explorer view is not indexed yet");
    expect(wrapper.text()).toContain("SidΞcoin only shows live chain data");
    expect(wrapper.text()).toContain("No blocks found");
    expect(wrapper.text()).toContain("No transactions found");
    expect(wrapper.text()).not.toContain("Demo-backed scaffold");
    expect(wrapper.text()).not.toContain("Current demo index");

    vi.doUnmock("../api");
  });
});

describe("address live utxo fallback", () => {
  it("explains when live UTXO rows are not shown yet", async () => {
    vi.resetModules();

    vi.doMock("../api", () => ({
      getAddress: vi.fn(async () => ({
        chainId: "l1",
        address: "tb1qtestaddress0000",
        balance: "1.00000000 BTC",
        totalReceived: "1.00000000 BTC",
        totalSent: "0.00000000 BTC",
        transactionCount: 1,
        utxoCount: 1,
        utxos: [],
        transactions: [],
      })),
    }));

    const { default: AddressView } = await import("../views/AddressView.vue");

    const router = createRouter({
      history: createWebHistory(),
      routes,
    });

    router.push("/l1/address/tb1qtestaddress0000");
    await router.isReady();

    const wrapper = mount(AddressView, {
      global: {
        plugins: [router],
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("UTXO details");
    });

    expect(wrapper.text()).toContain("Address balance and transaction history are live");
    expect(wrapper.text()).toContain("not shown yet for this indexed chain");

    vi.doUnmock("../api");
  });
});
