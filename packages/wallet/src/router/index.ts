// packages/wallet/src/router/index.ts

import { createRouter, createWebHashHistory } from "vue-router";

import DashboardView from "../views/DashboardView.vue";
import SendView from "../views/SendView.vue";
import ReceiveView from "../views/ReceiveView.vue";
import AssetSwapView from "../views/AssetSwapView.vue";
import SidechainsView from "../views/SidechainsView.vue";
import PlatformDetailView from "../views/PlatformDetailView.vue";
import HardwareWalletView from "../views/HardwareWalletView.vue";
import ToolboxView from "../views/ToolboxView.vue";
import ProBenefitsView from "../views/ProBenefitsView.vue";
import SettingsView from "../views/SettingsView.vue";
import OnboardingView from "../views/OnboardingView.vue";

import { hasWallet } from "../keystore";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/onboarding", name: "onboarding", component: OnboardingView },
    { path: "/", name: "dashboard", component: DashboardView },
    { path: "/send", name: "send", component: SendView },
    { path: "/receive", name: "receive", component: ReceiveView },
    { path: "/swap", name: "swap", component: AssetSwapView },
    { path: "/platforms", name: "platforms", component: SidechainsView },
    {
      path: "/platforms/:platformId",
      name: "platform-detail",
      component: PlatformDetailView,
      props: true,
    },
    { path: "/hardware", name: "hardware", component: HardwareWalletView },
    { path: "/toolbox", name: "toolbox", component: ToolboxView },
    { path: "/pro", name: "pro", component: ProBenefitsView },
    { path: "/settings", name: "settings", component: SettingsView },
  ],
});

// Gate: no wallet → force onboarding. Onboarding itself is always reachable
// (also serves as the "reset / re-import" entry point).
router.beforeEach((to) => {
  if (to.name === "onboarding") return true;
  if (!hasWallet()) return { name: "onboarding" };
  return true;
});

export default router;
