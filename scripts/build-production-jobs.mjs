import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const outdir = "dist/jobs";
const entries = [
  "run-traffic-aggregation",
  "run-scoring-jobs",
  "run-scoring-job",
  "ga4-sync",
  "ga4-realtime",
  "ga4-health",
  "ga4-backfill",
  "boost-pace",
  "boost-aggregate",
  "boost-complete",
  "boost-underdelivery",
  "boost-reconcile-payments",
  "boost-release-reservations",
].map((name) => `scripts/${name}.ts`);

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: entries,
  outdir,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  minify: false,
  // `server-only` is a Next.js compile-time boundary. The production job
  // artifacts are already server-side Node entrypoints, so bundle a no-op
  // marker instead of shipping a runtime module that throws on startup.
  alias: { "server-only": resolve("scripts/server-only-noop.mjs") },
  outExtension: { ".js": ".mjs" },
  // Keep pg as a native Node dependency. Bundling its CommonJS dynamic
  // requires into ESM produces a runtime `Dynamic require` failure.
  external: ["pg", "pg-native"],
  logLevel: "info",
});
console.log(`Built ${entries.length} production job artifacts in ${outdir}.`);
