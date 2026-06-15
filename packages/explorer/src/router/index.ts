// packages/explorer/src/router/index.ts

import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

import HomeView from "../views/HomeView.vue";
import ChainView from "../views/ChainView.vue";
import BlockView from "../views/BlockView.vue";
import TransactionView from "../views/TransactionView.vue";
import AddressView from "../views/AddressView.vue";
import NotFoundView from "../views/NotFoundView.vue";

export const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: HomeView },
  { path: "/:chain", name: "chain", component: ChainView, props: true },
  {
    path: "/:chain/block/:id",
    name: "block",
    component: BlockView,
    props: true,
  },
  {
    path: "/:chain/tx/:txid",
    name: "transaction",
    component: TransactionView,
    props: true,
  },
  {
    path: "/:chain/address/:address",
    name: "address",
    component: AddressView,
    props: true,
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: NotFoundView,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
