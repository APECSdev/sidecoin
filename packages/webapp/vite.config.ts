// packages/webapp/vite.config.ts

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
});
