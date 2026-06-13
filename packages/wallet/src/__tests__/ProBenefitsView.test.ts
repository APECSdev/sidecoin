// packages/wallet/src/__tests__/ProBenefitsView.test.ts

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProBenefitsView from "../views/ProBenefitsView.vue";

describe("ProBenefitsView.vue", () => {
  it("renders the PRO benefits page", () => {
    const wrapper = mount(ProBenefitsView, {
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });

    expect(wrapper.text()).toContain("Sidecoin PRO");
    expect(wrapper.text()).toContain("Drivechains Financial Hub");
  });

  it("describes Basic and PRO access", () => {
    const wrapper = mount(ProBenefitsView, {
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });

    expect(wrapper.text()).toContain("Basic includes");
    expect(wrapper.text()).toContain("Thunder payments");
    expect(wrapper.text()).toContain("PRO platforms");
    expect(wrapper.text()).toContain("Early access");
  });
});
