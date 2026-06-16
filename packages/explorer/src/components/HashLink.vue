<!-- packages/explorer/src/components/HashLink.vue -->

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import { truncateMiddle } from "../explorer/format";

const props = withDefaults(
  defineProps<{
    value: string;
    chainId?: string;
    routeName?: "block" | "transaction" | "address";
    paramName?: "id" | "txid" | "address";
    truncate?: boolean;
    head?: number;
    tail?: number;
  }>(),
  {
    chainId: "",
    routeName: undefined,
    paramName: undefined,
    truncate: true,
    head: 10,
    tail: 8,
  },
);

const displayValue = computed(() => {
  if (!props.truncate) return props.value;
  return truncateMiddle(props.value, props.head, props.tail);
});

const route = computed<RouteLocationRaw | null>(() => {
  if (!props.chainId || !props.routeName || !props.paramName) return null;

  return {
    name: props.routeName,
    params: {
      chain: props.chainId,
      [props.paramName]: props.value,
    },
  };
});
</script>

<template>
  <RouterLink
    v-if="route"
    :to="route"
    :title="value"
    class="break-all font-mono font-bold text-cyan-300 hover:text-cyan-200"
  >
    {{ displayValue }}
  </RouterLink>

  <span
    v-else
    :title="value"
    class="break-all font-mono text-gray-300"
  >
    {{ displayValue }}
  </span>
</template>
