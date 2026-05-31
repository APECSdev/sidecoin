// packages/web/vitest.config.ts
//
// Vitest configuration for @sidecoin/web.
// Matches the conventions used by @sidecoin/desktop and @sidecoin/wallet.

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },

  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.ts"],
    globals: false,
  },
});
