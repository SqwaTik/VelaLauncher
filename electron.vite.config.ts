import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  main: {
    // Keep node_modules (undici, @xmcl/*, etc.) external instead of bundling
    // them. Bundling turns undici's lazy `require('node:sqlite')` into a static
    // top-level import that Electron can't resolve and crashes on load.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
    css: {
      preprocessorOptions: {
        scss: { api: "modern-compiler" },
      },
    },
    plugins: [vue()],
  },
});
