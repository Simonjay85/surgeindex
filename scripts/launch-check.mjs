import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const evidenceDir = process.env.LAUNCH_EVIDENCE_DIR ? resolve(process.env.LAUNCH_EVIDENCE_DIR) : null;
if (evidenceDir) mkdirSync(evidenceDir, { recursive: true });

const gitValue = (args, fallback = "unknown") => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
};

const safeSha = process.env.GITHUB_SHA || gitValue(["rev-parse", "HEAD"]);
const generatedAt = new Date().toISOString();
const runStartedAt = process.env.WORKFLOW_RUN_STARTED_AT || process.env.GITHUB_RUN_STARTED_AT || generatedAt;

function redact(value) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s)'"`]+/gi, "postgresql://[REDACTED]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(password|secret|token|api[_-]?key|private[_-]?key|authorization)(\s*[=:]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b/g, "stripe_[REDACTED]")
    .replace(/\bwhsec_[A-Za-z0-9]+\b/g, "webhook_[REDACTED]")
    .replace(/\b(?:gh[opsu]|github_pat)_[A-Za-z0-9_]+\b/g, "github_[REDACTED]");
}

function redactEnvironment(value) {
  let output = value;
  for (const [key, secret] of Object.entries(process.env)) {
    if (!secret || secret.length < 8 || !/(password|secret|token|key|credential|authorization|database_url|email_http_api_key)/i.test(key)) continue;
    output = output.split(secret).join("[REDACTED]");
  }
  return redact(output);
}

function slug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function writeEvidenceFile(name, contents) {
  if (!evidenceDir) return null;
  const filename = `${slug(name)}.log`;
  writeFileSync(resolve(evidenceDir, filename), redactEnvironment(contents), "utf8");
  return filename;
}

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
  ...(evidenceDir ? { LAUNCH_EVIDENCE_DIR: evidenceDir, MIGRATION_EVIDENCE_FILE: resolve(evidenceDir, "migration-evidence.json") } : {}),
};

const commands = [
  ["working-tree diff check", "git", ["diff", "--check"]],
  ["typecheck", "pnpm", ["typecheck"]],
  ["lint", "pnpm", ["lint"]],
  ["unit tests", "pnpm", ["test"]],
  ["tracker tests", "pnpm", ["tracker:test"]],
  ["boost fixture", "pnpm", ["boost:fixture"]],
  ["GA4 fixture", "pnpm", ["ga4:fixture"]],
  ["Stripe fixture", "pnpm", ["stripe:test-webhook"]],
  ["placement inventory", "pnpm", ["boost:placement-check"]],
  ["Fanward Nginx release boundary", "pnpm", ["nginx:release-check"]],
  ["secret scan", "pnpm", ["security:scan"]],
  ["production job artifacts", "pnpm", ["jobs:build"]],
  ["job artifact smoke", "pnpm", ["jobs:smoke"]],
  ["migration smoke", "pnpm", ["db:smoke"]],
  ["production build", "pnpm", ["build"]],
  ["browser E2E", "pnpm", ["test:e2e"]],
];

const results = [];
let overallResult = "PASS";

for (const [label, command, args] of commands) {
  const started = Date.now();
  const result = spawnSync(command, args, { encoding: "utf8", env: baseEnv, maxBuffer: 20 * 1024 * 1024 });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const output = `${stdout}${stderr ? `\n${stderr}` : ""}`;
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const item = {
    label,
    command: [command, ...args].join(" "),
    result: exitCode === 0 ? "PASS" : "FAIL",
    exitCode,
    durationMs: Date.now() - started,
    logFile: writeEvidenceFile(label, output),
  };
  results.push(item);
  console.log(`${item.result} ${label} (${item.durationMs}ms)`);
  if (exitCode !== 0) {
    overallResult = "FAIL";
    const safeOutput = redactEnvironment(output);
    if (safeOutput.trim()) console.error(safeOutput.slice(-12_000));
    break;
  }
}

function readMigrationEvidence() {
  if (!evidenceDir) return null;
  try {
    return JSON.parse(readFileSync(resolve(evidenceDir, "migration-evidence.json"), "utf8"));
  } catch {
    return null;
  }
}

const migrationEvidence = readMigrationEvidence();
const evidence = {
  schemaVersion: 1,
  result: overallResult,
  generatedAt,
  workflowRunStartedAt: runStartedAt,
  commitSha: safeSha,
  branch: process.env.GITHUB_REF_NAME || gitValue(["branch", "--show-current"]),
  environment: {
    appMode: baseEnv.APP_MODE,
    dataProvider: baseEnv.DATA_PROVIDER,
    nodeVersion: process.version,
    postgresVersion: migrationEvidence?.postgres?.version ?? null,
    migrationCount: migrationEvidence?.batch6Upgrade?.finalMigrationCount ?? migrationEvidence?.fresh?.migrationCount ?? null,
  },
  checks: results,
  requiredResults: {
    typecheck: results.find((item) => item.label === "typecheck")?.result ?? "PENDING",
    lint: results.find((item) => item.label === "lint")?.result ?? "PENDING",
    unitTest: results.find((item) => item.label === "unit tests")?.result ?? "PENDING",
    build: results.find((item) => item.label === "production build")?.result ?? "PENDING",
    e2e: results.find((item) => item.label === "browser E2E")?.result ?? "PENDING",
    freshMigration: migrationEvidence?.fresh?.result ?? "PENDING",
    batch6MigrationUpgrade: migrationEvidence?.batch6Upgrade?.result ?? "PENDING",
  },
  migrationEvidenceFile: migrationEvidence ? basename(resolve(evidenceDir, "migration-evidence.json")) : null,
  secretsPrinted: false,
};

if (evidenceDir) writeFileSync(resolve(evidenceDir, "launch-readiness-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

if (overallResult !== "PASS") process.exitCode = 1;
else console.log("PASS launch-check: all configured launch-readiness checks completed.");
