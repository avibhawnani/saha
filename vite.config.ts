import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * The Anakin key must never reach the browser. Anakin's API does send
 * `access-control-allow-origin: *` and accepts `X-API-Key` from a page, so
 * calling it directly from client code works — but it would put the key in the
 * bundle for anyone to read and drain. So the dev server proxies instead and
 * injects the header here.
 *
 * In production this same path belongs behind a real function (a Supabase edge
 * function or a serverless route); the client code does not change, because it
 * only ever talks to /api/anakin.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const key = env.ANAKIN_API_KEY;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/anakin": {
          target: "https://api.anakin.io",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anakin/, "/v1"),
          headers: key ? { "X-API-Key": key } : undefined,
        },
      },
    },
  };
});
