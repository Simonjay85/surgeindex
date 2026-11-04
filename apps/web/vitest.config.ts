import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Next's server-only guard is intentionally a no-op in Vitest's Node/jsdom
    // test process; the production bundle still resolves the real package.
    alias: { "server-only": fileURLToPath(new URL("./tests/server-only-shim.ts", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
