import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

const DEFAULT_DEV_API_PROXY = "http://localhost:3000";

// Multiple HTML entry points: the dashboard SPA (`index.html`) and the
// standalone login page (`login.html`). Without listing it here, Vite would
// silently drop login.html from the build output.
const HTML_ENTRIES = {
  main: "index.html",
  login: "login.html",
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiProxy = env.VITE_DEV_API_PROXY || DEFAULT_DEV_API_PROXY;

  return {
    plugins: [react(), tailwindcss()],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
      proxy: {
        // Backend API + auth routes
        "/api": { target: apiProxy, changeOrigin: true },
        // The standalone login HTML is served by the backend (see
        // backend/src/server.ts). Proxy /login here so the dev experience
        // matches production, where Express handles it.
        "/login": { target: apiProxy, changeOrigin: true },
        // Socket.IO upgrades — needs `ws: true` for the WebSocket handshake.
        "/socket.io": { target: apiProxy, changeOrigin: true, ws: true },
      },
    },
    build: {
      rollupOptions: {
        input: HTML_ENTRIES,
      },
    },
  };
});
