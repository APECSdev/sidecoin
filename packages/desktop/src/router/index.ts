// packages/desktop/src/router/index.ts

import { createRouter, createWebHistory } from "vue-router";

import DashboardView from "../views/DashboardView.vue";
import SendView from "../views/SendView.vue";
import ReceiveView from "../views/ReceiveView.vue";
import SidechainsView from "../views/SidechainsView.vue";
import SettingsView from "../views/SettingsView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "dashboard", component: DashboardView },
    { path: "/send", name: "send", component: SendView },
    { path: "/receive", name: "receive", component: ReceiveView },
    { path: "/sidechains", name: "sidechains", component: SidechainsView },
    { path: "/settings", name: "settings", component: SettingsView },
  ],
});

export default router;
