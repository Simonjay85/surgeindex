import { spawnSync } from "node:child_process";

const baseEnv = {
  ...process.env,
  APP_MODE: "demo",
  DATA_PROVIDER: "demo",
  ANALYTICS_PROVIDER: "postgres",
  GA4_PROVIDER_MODE: "fixture",
  BOOST_ENABLED: "false",
  BOOST_LIVE_MODE_ENABLED: "false",
  STRIPE_ENABLED: "false",
  SURGEINDEX_NEXT_DIST_DIR: ".next-launch-check",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
};

const commands = [
  ["working-tree diff check", ["__git_diff_check__"]],
  ["typecheck", ["typecheck"]],
  ["lint", ["lint"]],
  ["unit tests", ["test"]],
  ["tracker tests", ["tracker:test"]],
  ["boost fixture", ["boost:fixture"]],
  ["GA4 fixture", ["ga4:fixture"]],
  ["Stripe fixture", ["stripe:test-webhook"]],
  ["placement inventory", ["node", "scripts/boost-placement-check.mjs"]],
  ["secret scan", ["node", "scripts/secret-scan.mjs"]],
  ["production job artifacts", ["jobs:build"]],
  ["job artifact smoke", ["jobs:smoke"]],
  ["migration smoke", ["db:smoke"]],
  ["production build", ["build"]],
  ["browser E2E", ["test:e2e"]],
];

for (const [label, args] of commands) {
  console.log(`\n==> ${label}`);
  const command = args[0] === "__git_diff_check__" ? "git" : "pnpm";
  const commandArgs = args[0] === "__git_diff_check__" ? ["diff", "--check"] : args;
  const result = spawnSync(command, commandArgs, { stdio: "inherit", env: baseEnv });
  if (result.status !== 0) {
    console.error(`FAIL launch-check: ${label}`);
    process.exit(result.status ?? 1);
  }
}
console.log("\nPASS launch-check: diff check, typecheck, lint, unit/fixture tests, job artifacts, migration smoke, build, placement inventory, secret scan, and E2E completed.");
