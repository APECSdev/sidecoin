// packages/wallet/vite.config.ts

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [vue(), tsconfigPaths()],

  server: {
    port: 5174,
    strictPort: false,
  },

  build: {
    outDir: "dist",
    sourcemap: true,
  },

  test: {
    environment: "happy-dom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,vue}"],
      exclude: [
        "src/main.ts",
        "src/vite-env.d.ts",
        "src/style.css",
      ],
    },
  },
});
