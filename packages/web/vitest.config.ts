// packages/web/vitest.config.ts

import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
import fs from "node:fs";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.ts"],
    globals: false,
  },

  esbuild: {
    tsconfigRaw: JSON.parse(
      fs.readFileSync(new URL("./tsconfig.test.json", import.meta.url), "utf-8")
    ),
  },
});
