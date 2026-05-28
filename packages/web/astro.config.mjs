// packages/web/astro.config.mjs

import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://sidecoin.app",
  integrations: [vue()],
  vite: {
    plugins: [tailwindcss()],
  },
});
