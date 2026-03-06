import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  base: "/static/dist/",
  publicDir: false,
  build: {
    outDir: resolve(__dirname, "../static/dist"),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        map: resolve(__dirname, "src/map.ts"),
        photoMap: resolve(__dirname, "src/photo-map.ts"),
        admin: resolve(__dirname, "src/admin.ts"),
        login: resolve(__dirname, "src/login.ts")
      }
    }
  }
});
