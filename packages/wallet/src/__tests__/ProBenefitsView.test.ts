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

  it("clarifies yearly-only Founder eligibility", () => {
    const wrapper = mount(ProBenefitsView, {
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });

    expect(wrapper.text()).toContain("Founder eligibility");
    expect(wrapper.text()).toContain("Leaderboard and Alpha Circle require Yearly PRO");
    expect(wrapper.text()).toContain(
      "Monthly subscriptions do not qualify for Founder Leaderboard placement or Alpha Circle eligibility.",
    );
    expect(wrapper.text()).toContain("Yearly PRO");
    expect(wrapper.text()).toContain(
      "Unlocks Sidecoin PRO wallet features and qualifies for Founder Leaderboard placement and Alpha Circle eligibility.",
    );
  });
});
