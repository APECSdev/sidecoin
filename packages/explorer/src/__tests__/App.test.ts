// packages/explorer/src/__tests__/App.test.ts

import { mount } from "@vue/test-utils";
import { createRouter, createWebHistory } from "vue-router";
import App from "../App.vue";
import { routes } from "../router";

describe("App", () => {
  it("renders SidΞcoin Explorer shell", async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes,
    });

    router.push("/");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.text()).toContain("SidΞcoin Explorer");
    expect(wrapper.text()).toContain("L1 + Drivechains");
    expect(wrapper.find('img[src="/favicon-48x48.png"]').exists()).toBe(true);
  });
});
