// apps/wallet/src/main.ts

import "./polyfills";
import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";
import { initObservability } from "./observability";
import "./style.css";
import "./themes.css";

const app = createApp(App);
// GlitchTip error tracking. No VITE_GLITCHTIP_DSN => no-op, zero network calls.
// Wallet DSN stays unset until the shared scrubber is signed off.
initObservability(app);
app.use(createPinia());
app.use(router);
app.mount("#app");
