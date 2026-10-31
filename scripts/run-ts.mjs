/**
 * Runs a project TypeScript module in Node, using Vite's own SSR loader.
 *
 *   node scripts/run-ts.mjs scripts/check-ask.ts
 *
 * Node's --experimental-strip-types cannot resolve extensionless imports, and
 * Vite 8 ships rolldown rather than esbuild. Going through Vite means the
 * module graph resolves exactly as it does in the browser, so a check run this
 * way is testing the same code the app runs.
 */
import { createServer } from "vite";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/run-ts.mjs <file.ts>");
  process.exit(1);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

try {
  await server.ssrLoadModule(target);
} finally {
  await server.close();
}
