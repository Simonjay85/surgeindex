import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const stagingBaseUrl = process.env.STAGING_BASE_URL;
const evidenceFile = process.env.STAGING_READBACK_EVIDENCE_FILE;
const adminCookie = process.env.STAGING_ADMIN_COOKIE;
const basicAuthInput = process.env.STAGING_BASIC_AUTH?.trim();

function basicAuthHeader(value) {
  if (!value || value.length > 4096 || /[\r\n]/.test(value)) return null;
  if (/^Basic\s+/i.test(value)) return value;
  return `Basic ${Buffer.from(value, "utf8").toString("base64")}`;
}

// The secret is read once and only the derived Authorization header is sent to
// the staging origin. Never include the value or the header in evidence.
const basicAuth = basicAuthHeader(basicAuthInput);

function fail(message) {
  console.error(`staging-readback: ${message}`);
  process.exitCode = 1;
}

function safeError(error) {
  return error instanceof Error ? error.name : "UnknownError";
}

function isSensitiveKey(key) {
  return /(secret|token|password|cookie|authorization|credential|email|ip|visitor|session|attribution|hash)/i.test(key);
}

function safeProjection(value, key = "", depth = 0) {
  if (depth > 4) return "[TRUNCATED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return isSensitiveKey(key) ? "[REDACTED]" : value.slice(0, 240);
  if (Array.isArray(value)) return { itemCount: value.length, items: value.slice(0, 20).map((item) => safeProjection(item, key, depth + 1)) };
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, safeProjection(childValue, childKey, depth + 1)]));
  }
  return "[UNSUPPORTED]";
}

async function getJson(baseUrl, path) {
  const url = new URL(path, baseUrl);
  const headers = { accept: "application/json", "user-agent": "surgeindex-staging-readback/1" };
  if (adminCookie) headers.cookie = adminCookie;
  if (basicAuth) headers.authorization = basicAuth;
  try {
    const response = await fetch(url, { headers, redirect: "manual" });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { path, status: response.status, ok: response.ok, requestId: response.headers.get("x-request-id"), body };
  } catch (error) {
    return { path, status: null, ok: false, requestId: null, body: null, errorType: safeError(error) };
  }
}

function checkResult(name, response, predicate = () => response.ok) {
  return {
    name,
    result: predicate(response) ? "PASS" : response.status === null ? "BLOCKED" : "FAIL",
    status: response.status,
    requestId: response.requestId,
    data: safeProjection(response.body?.data ?? null),
    errorType: response.errorType ?? null,
  };
}

async function writeEvidence(evidence) {
  if (!evidenceFile) return;
  await mkdir(dirname(resolve(evidenceFile)), { recursive: true });
  await writeFile(resolve(evidenceFile), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

if (!stagingBaseUrl) {
  fail("set STAGING_BASE_URL to an approved staging origin.");
} else {
  let baseUrl;
  try {
    baseUrl = new URL(stagingBaseUrl);
    const localHttpAllowed = process.env.STAGING_ALLOW_HTTP_LOCAL === "YES" && ["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname.replace(/^\[|\]$/g, ""));
    if (baseUrl.protocol !== "https:" && !localHttpAllowed) throw new Error("STAGING_BASE_URL must use HTTPS unless an explicit local HTTP check is enabled.");
    baseUrl.search = "";
    baseUrl.hash = "";
  } catch (error) {
    fail(error instanceof Error ? error.message : "invalid staging URL");
  }

  if (baseUrl) {
    const live = await getJson(baseUrl, "/api/health/live");
    const ready = await getJson(baseUrl, "/api/health/ready");
    const checks = [
      checkResult("health.live", live, (response) => response.ok && response.body?.data?.status === "ok"),
      checkResult("health.ready", ready, (response) => response.ok && response.body?.data?.ready === true && response.body?.data?.mode === "production"),
    ];

    const adminChecks = ["/api/admin/traffic/summary", "/api/admin/jobs/health", "/api/admin/scoring/health"].map(async (path) => {
      if (!adminCookie && !basicAuth) return { name: path, result: "PENDING", status: null, requestId: null, data: null, errorType: "admin_session_not_supplied" };
      return checkResult(path, await getJson(baseUrl, path), (response) => response.ok);
    });
    checks.push(...await Promise.all(adminChecks));

    const externalPipeline = {
      result: "PENDING",
      stages: {
        trackerJsInstallation: "PENDING",
        collector: "PENDING",
        fraudDecision: "PENDING",
        activeSession: "PENDING",
        aggregation: "PENDING",
        scoring: "PENDING",
        ranking: "PENDING",
        breakoutDetection: "PENDING",
        systemJobRun: "PENDING",
        freshnessReadiness: checks.find((check) => check.name === "health.ready")?.result ?? "PENDING",
      },
      note: "Complete the controlled-page event procedure and attach safe event/request IDs; this read-only probe does not manufacture tracker traffic or infer stage success from health alone.",
    };
    const hasFailure = checks.some((check) => check.result === "FAIL" || check.result === "BLOCKED");
    const hasPending = checks.some((check) => check.result === "PENDING") || externalPipeline.result === "PENDING";
    const evidence = {
      schemaVersion: 1,
      result: hasFailure ? "FAIL" : hasPending ? "PENDING" : "PASS",
      generatedAt: new Date().toISOString(),
      commitSha: process.env.GITHUB_SHA ?? "unknown",
      stagingOrigin: baseUrl.origin,
      adminSessionProvided: Boolean(adminCookie),
      basicAuthProvided: Boolean(basicAuth),
      secretsPrinted: false,
      checks,
      pipeline: externalPipeline,
    };
    await writeEvidence(evidence);
    console.log(JSON.stringify(evidence, null, 2));
    if (evidence.result === "FAIL" || evidence.result === "PENDING") process.exitCode = 1;
  }
}
