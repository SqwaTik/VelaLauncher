import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "src/webview"),
  base: "./",
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src/webview"),
      "@shared": resolve(import.meta.dirname, "src/shared"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "native/VelaLauncher.Host/wwwroot"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
  },
  plugins: [react(), tailwindcss()],
});
