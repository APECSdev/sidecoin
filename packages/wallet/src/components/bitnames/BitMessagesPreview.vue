<!-- packages/wallet/src/components/bitnames/BitMessagesPreview.vue -->

<script setup lang="ts">
import { computed } from "vue";
import CoinNewsPreview from "./CoinNewsPreview.vue";

interface BitNamesContact {
  name: string;
  displayName: string;
  useCase: string;
  status: string;
  lastSeen: string;
  paymentHint: string;
}

interface BitNamesMessage {
  contact: string;
  side: "sent" | "received";
  time: string;
  body: string;
}

const props = defineProps<{
  contacts: BitNamesContact[];
  messages: BitNamesMessage[];
  selectedContactName: string;
}>();

const emit = defineEmits<{
  "update:selectedContactName": [value: string];
}>();

const selectedContact = computed(() => {
  return props.contacts.find((contact) => contact.name === props.selectedContactName) ?? props.contacts[0];
});

const selectedConversation = computed(() => {
  return props.messages.filter((message) => message.contact === props.selectedContactName);
});

function selectContact(contactName: string) {
  emit("update:selectedContactName", contactName);
}
</script>

<template>
  <div class="mt-6 space-y-6">
    <div class="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-950 via-gray-950 to-gray-900 p-6">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs uppercase tracking-widest text-ecash-500">
              BitNames identity
            </p>
            <span class="rounded-full border border-ecash-500/40 bg-ecash-950/60 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-ecash-300">
              Live Coin News
            </span>
          </div>

          <h3 class="mt-3 text-3xl font-black text-white">BitMessages</h3>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            Broadcast signed posts, weekly news, and BitNames-linked messages
            across Signet from one wallet-native identity surface.
          </p>
        </div>

        <div class="grid grid-cols-3 gap-3 rounded-2xl border border-gray-800 bg-gray-950/70 p-3 text-center">
          <div class="px-3 py-2">
            <p class="text-lg font-black text-ecash-400">24</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Messages</p>
          </div>
          <div class="border-x border-gray-800 px-3 py-2">
            <p class="text-lg font-black text-ecash-400">2</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Feeds</p>
          </div>
          <div class="px-3 py-2">
            <p class="text-lg font-black text-ecash-400">Signet</p>
            <p class="text-[10px] uppercase tracking-wide text-gray-500">Network</p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
      <div>
        <CoinNewsPreview :show-hero="false" />
      </div>

      <aside class="space-y-6">
        <section class="rounded-2xl border border-gray-800 bg-gray-950 p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-widest text-gray-500">
                Identity
              </p>
              <h3 class="mt-2 text-xl font-black text-white">sidecoin.bit</h3>
            </div>
            <span class="rounded-full bg-ecash-900 px-3 py-1 text-xs font-black text-ecash-300">
              Resolved
            </span>
          </div>

          <dl class="mt-5 space-y-3 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-gray-500">Default feed</dt>
              <dd class="font-semibold text-gray-200">Live indexed feed</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-gray-500">Message fee</dt>
              <dd class="font-mono text-ecash-300">Indexed live</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-gray-500">Contact</dt>
              <dd class="font-mono text-gray-200">{{ selectedContact.name }}</dd>
            </div>
          </dl>
        </section>

        <section class="rounded-2xl border border-gray-800 bg-gray-950 p-5">
          <h3 class="text-xl font-black text-white">Broadcast News</h3>

          <label class="mt-5 block">
            <span class="text-xs uppercase tracking-widest text-gray-500">From</span>
            <input
              readonly
              value="sidecoin.bit"
              class="mt-2 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 font-mono text-sm text-ecash-300"
            />
          </label>

          <div class="mt-5 rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p class="text-sm font-semibold text-white">Composer not connected yet</p>
            <p class="mt-2 text-sm leading-6 text-gray-400">
              Live Coin News reads are connected. Broadcast writing will appear
              here once the write endpoint is available.
            </p>
          </div>

          <button
            type="button"
            class="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500"
          >
            Broadcast News
          </button>
        </section>

        <section class="rounded-2xl border border-gray-800 bg-gray-950 p-5">
          <h3 class="text-xl font-black text-white">Contacts</h3>

          <div class="mt-4 space-y-2">
            <button
              v-for="contact in contacts"
              :key="contact.name"
              type="button"
              class="w-full rounded-lg border px-4 py-3 text-left transition-colors"
              :class="selectedContactName === contact.name ? 'border-ecash-600 bg-ecash-950/30' : 'border-gray-800 bg-gray-900 hover:border-gray-700'"
              @click="selectContact(contact.name)"
            >
              <p class="font-semibold text-white">{{ contact.name }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ contact.useCase }}</p>
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-gray-800 bg-gray-950 p-5">
          <h3 class="text-xl font-black text-white">BitNames Thread</h3>
          <p class="mt-1 text-sm text-gray-500">{{ selectedContact.paymentHint }}</p>

          <div class="mt-5 space-y-3">
            <div
              v-for="message in selectedConversation"
              :key="`${message.contact}-${message.time}-${message.body}`"
              class="rounded-xl border border-gray-800 bg-gray-900 p-3"
            >
              <p class="text-sm leading-6 text-gray-200">{{ message.body }}</p>
              <p class="mt-2 text-xs text-gray-500">{{ message.time }}</p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
