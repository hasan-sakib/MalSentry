import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/upload": { target: "http://127.0.0.1:5002", changeOrigin: true },
      "/detect": { target: "http://127.0.0.1:5002", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:5002", changeOrigin: true },
      "/static/uploads": { target: "http://127.0.0.1:5002", changeOrigin: true },
    },
  },
  build: {
    outDir: "../static/spa",
    emptyOutDir: true,
  },
})
