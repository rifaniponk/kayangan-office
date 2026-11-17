import { defineConfig } from "vite";

export default defineConfig({
  // The project is served from the repo root, so assets live in public/.
  base: "./",
  build: {
    target: "es2022",
    sourcemap: false,
    // Keep the bundle small; three is the only runtime dependency.
    chunkSizeWarningLimit: 900,
  },
  preview: { port: 4173, strictPort: true },
  server: { port: 5173, strictPort: true },
});
