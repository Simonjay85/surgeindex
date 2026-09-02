import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const evidenceDir = resolve(process.env.DB_TEST_EVIDENCE_DIR ?? "artifacts/database-tests");
const reportDir = mkdtempSync(join(tmpdir(), "surgeindex-db-tests-"));
const startedAt = new Date().toISOString();
const suites = [
  { workspace: "web", file: "tests/ranking-engine.integration.test.ts" },
  { workspace: "web", file: "tests/tracker-key-service.test.ts" },
  { workspace: "web", file: "tests/site-settings-key-concurrency.integration.test.ts" },
  { workspace: "@surge/analytics", file: "test/postgres-provider.test.ts" },
  { workspace: "@surge/db", file: "test/repositories.test.ts" },
];

function commitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function redact(value) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s)'"`]+/gi, "postgresql://[REDACTED]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(password|secret|token|api[_-]?key|private[_-]?key|authorization)(\s*[=:]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b/g, "stripe_[REDACTED]")
    .replace(/\bwhsec_[A-Za-z0-9]+\b/g, "webhook_[REDACTED]");
}

function redactEnvironment(value) {
  let output = value;
  for (const [key, secret] of Object.entries(process.env)) {
    if (!secret || secret.length < 8 || !/(password|secret|token|key|credential|authorization|database_url|email_http_api_key)/i.test(key)) continue;
    output = output.split(secret).join("[REDACTED]");
  }
  return redact(output);
}

function writeEvidence(evidence) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, "database-test-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

function reportFor(file, reportPath) {
  if (!existsSync(reportPath)) return null;
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const testResult = report.testResults?.find((item) => typeof item.name === "string" && item.name.endsWith(`/${file}`));
    return { report, testResult };
  } catch {
    return null;
  }
}

function reportFailureSummary(testResult) {
  const assertionResults = Array.isArray(testResult?.assertionResults) ? testResult.assertionResults : [];
  return assertionResults
    .filter((item) => item?.status !== "passed" || (Array.isArray(item.failureMessages) && item.failureMessages.length > 0))
    .map((item) => ({
      fullName: typeof item.fullName === "string" ? item.fullName.slice(0, 300) : null,
      status: typeof item.status === "string" ? item.status : "unknown",
      messages: (Array.isArray(item.failureMessages) ? item.failureMessages : [])
        .map((message) => redactEnvironment(String(message)).slice(0, 4000))
        .filter(Boolean)
        .slice(0, 3),
    }))
    .slice(0, 10);
}

function pendingSuite() {
  return { result: "PENDING", exitCode: null, testCount: 0, pendingCount: 0, reportStatus: "not_run", logFile: null, durationMs: 0 };
}

const evidence = {
  schemaVersion: 1,
  result: "FAIL",
  generatedAt: startedAt,
  completedAt: null,
  commitSha: commitSha(),
  environment: {
    runDbTests: process.env.RUN_DB_TESTS === "1",
    appMode: process.env.APP_MODE ?? null,
    dataProvider: process.env.DATA_PROVIDER ?? null,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    unpooledDatabaseConfigured: Boolean(process.env.DATABASE_URL_UNPOOLED),
  },
  requiredSuites: suites.map((suite) => ({ ...suite, ...pendingSuite() })),
  secretsPrinted: false,
};

const requiredEnvironment = [
  ["RUN_DB_TESTS", "1"],
  ["APP_MODE", "production"],
  ["DATA_PROVIDER", "postgres"],
];
const invalidEnvironment = requiredEnvironment.find(([name, expected]) => process.env[name] !== expected) ?? (!process.env.DATABASE_URL ? ["DATABASE_URL", "configured"] : null);

try {
  if (invalidEnvironment) {
    console.error(`database-tests: required environment ${invalidEnvironment[0]}=${invalidEnvironment[1]} was not configured.`);
    process.exitCode = 1;
  } else {
    for (const [index, suite] of suites.entries()) {
      const reportPath = join(reportDir, `${index}.json`);
      const started = Date.now();
      const command = ["-F", suite.workspace, "exec", "vitest", "run", suite.file, "--reporter=verbose", "--reporter=json", `--outputFile=${reportPath}`];
      const result = spawnSync("pnpm", command, {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        env: process.env,
      });
      const output = `${typeof result.stdout === "string" ? result.stdout : ""}${result.stderr ? `\n${result.stderr}` : ""}${result.error?.message ? `\n${result.error.message}` : ""}`;
      const logName = `${suite.workspace.replace(/[^a-z0-9]+/gi, "-")}-${suite.file.replace(/[^a-z0-9]+/gi, "-")}.log`;
      const parsed = reportFor(suite.file, reportPath);
      const testResult = parsed?.testResult;
      const assertionResults = Array.isArray(testResult?.assertionResults) ? testResult.assertionResults : [];
      const pendingCount = assertionResults.filter((item) => item.status !== "passed").length;
      const testCount = assertionResults.length;
      const failureSummary = reportFailureSummary(testResult);
      const reportDiagnostics = JSON.stringify({
        reportSuccess: parsed?.report?.success ?? null,
        suiteStatus: testResult?.status ?? "missing",
        failures: failureSummary,
      });
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(join(evidenceDir, logName), `${redactEnvironment(output)}\nVitest report diagnostics: ${reportDiagnostics}\n`, "utf8");
      const resultCode = typeof result.status === "number" ? result.status : 1;
      const passed = resultCode === 0
        && parsed?.report?.success === true
        && testResult?.status === "passed"
        && testCount > 0
        && pendingCount === 0;
      evidence.requiredSuites[index] = {
        ...suite,
        result: passed ? "PASS" : "FAIL",
        exitCode: resultCode,
        testCount,
        pendingCount,
        reportStatus: testResult?.status ?? "missing",
        failureSummary,
        logFile: logName,
        durationMs: Date.now() - started,
      };
      if (!passed) {
        console.error(`FAIL database suite ${suite.file}: file was missing, failed, or had skipped/pending tests. Diagnostics: ${reportDiagnostics}`);
        process.exitCode = 1;
        break;
      }
      console.log(`PASS database suite ${suite.file}: ${testCount} tests executed and passed.`);
    }
    if (!process.exitCode) {
      evidence.result = "PASS";
      console.log("PASS database-tests: every required PostgreSQL suite executed without skipped or pending tests.");
    }
  }
} finally {
  evidence.completedAt = new Date().toISOString();
  writeEvidence(evidence);
  rmSync(reportDir, { recursive: true, force: true });
}
