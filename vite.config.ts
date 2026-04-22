import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 4173,
  },
  build: {
    outDir: "../../dist-web",
    emptyOutDir: true,
  },
});
