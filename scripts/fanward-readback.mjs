import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const scriptPath = fileURLToPath(import.meta.url);
const toolRoot = resolve(dirname(scriptPath), "..");

class ConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = "ConfigurationError";
    this.code = code;
  }
}

function configurationError(code) {
  throw new ConfigurationError(code);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) configurationError(`${name.toLowerCase()}_required`);
  return value;
}

function yes(name) {
  return process.env[name] === "YES";
}

function parseMode() {
  const mode = required("FANWARD_READBACK_MODE");
  if (!["staging", "production", "rollback-rehearsal"].includes(mode)) {
    configurationError("fanward_readback_mode_invalid");
  }
  return mode;
}

function parseDeployment(mode) {
  const deployment = required("FANWARD_READBACK_DEPLOYMENT");
  if (!["staging", "production"].includes(deployment)) {
    configurationError("fanward_readback_deployment_invalid");
  }
  if (mode !== "rollback-rehearsal" && deployment !== mode) {
    configurationError("fanward_readback_mode_deployment_mismatch");
  }
  return deployment;
}

function parseSha(name, fallback) {
  const value = (process.env[name]?.trim() || fallback || "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(value)) configurationError(`${name.toLowerCase()}_invalid`);
  return value;
}

function parseOrigin(name, { allowLocalHttp = false } = {}) {
  const raw = required(name);
  let url;
  try {
    url = new URL(raw);
  } catch {
    configurationError(`${name.toLowerCase()}_invalid`);
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, ""));
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    configurationError(`${name.toLowerCase()}_must_be_origin_only`);
  }
  if (url.protocol !== "https:" && !(allowLocalHttp && local && url.protocol === "http:")) {
    configurationError(`${name.toLowerCase()}_https_required`);
  }
  return new URL(url.origin);
}

function parseHostOverride() {
  const value = process.env.FANWARD_READBACK_HOST?.trim();
  if (!value) return null;
  if (value.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::\d{1,5})?$/i.test(value)) {
    configurationError("fanward_readback_host_invalid");
  }
  return value;
}

function parseSecretHeader(name, { requireEquals = false } = {}) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (value.length > 8192 || /[\r\n\0]/.test(value) || (requireEquals && !value.includes("="))) {
    configurationError(`${name.toLowerCase()}_invalid`);
  }
  return value;
}

function basicAuthorization(value) {
  if (!value) return null;
  if (/^Basic\s+[A-Za-z0-9+/]+=*$/i.test(value)) return value;
  if (!value.includes(":")) configurationError("fanward_readback_basic_auth_invalid");
  return `Basic ${Buffer.from(value, "utf8").toString("base64")}`;
}

function parseTimeout() {
  const value = Number(process.env.FANWARD_READBACK_TIMEOUT_MS ?? 8_000);
  if (!Number.isInteger(value) || value < 1_000 || value > 30_000) {
    configurationError("fanward_readback_timeout_invalid");
  }
  return value;
}

function fixtureLoopbackIp(expectedSha) {
  const octets = [0, 2, 4].map((offset) => (Number.parseInt(expectedSha.slice(offset, offset + 2), 16) % 254) + 1);
  return `127.${octets.join(".")}`;
}

function parseTrustedClientIpOverride(config) {
  const value = process.env.FANWARD_READBACK_TRUSTED_CLIENT_IP?.trim();
  if (!value) return null;
  if (
    config.mode !== "staging"
    || config.deployment !== "staging"
    || !config.allowLocalHttp
    || config.baseUrl.origin !== "http://127.0.0.1:3212"
    || config.publicOrigin.origin !== "https://staging.surgeindex.lol"
    || config.hostOverride !== "staging.surgeindex.lol"
    || isIP(value) !== 4
    || value !== fixtureLoopbackIp(config.expectedSha)
  ) {
    configurationError("fanward_readback_trusted_client_ip_not_fixture_loopback");
  }
  return value;
}

function validateTargetBinding(config) {
  const expectedOrigin = config.deployment === "production"
    ? "https://surgeindex.lol"
    : "https://staging.surgeindex.lol";
  if (config.publicOrigin.origin !== expectedOrigin) {
    configurationError("fanward_readback_public_origin_not_release_target");
  }

  const baseHostname = config.baseUrl.hostname.replace(/^\[|\]$/g, "");
  const baseIsLoopback = ["localhost", "127.0.0.1", "::1"].includes(baseHostname);
  if (config.baseUrl.origin === expectedOrigin) {
    if (config.hostOverride) configurationError("fanward_readback_host_forbidden_for_public_origin");
  } else if (baseIsLoopback && config.allowLocalHttp && config.baseUrl.protocol === "http:") {
    if (config.hostOverride !== config.publicOrigin.hostname) {
      configurationError("fanward_readback_loopback_host_must_match_public_origin");
    }
  } else {
    configurationError("fanward_readback_base_url_not_release_target");
  }

  if (config.deployment === "production" && config.basicAuth) {
    configurationError("fanward_readback_basic_auth_forbidden_in_production");
  }
  if (config.deployment === "staging" && config.baseUrl.origin === expectedOrigin && !config.basicAuth) {
    configurationError("fanward_readback_staging_basic_auth_required");
  }
  if (baseIsLoopback && config.basicAuth) {
    configurationError("fanward_readback_basic_auth_forbidden_for_loopback");
  }
}

function headerSummary(response) {
  return {
    contentType: response.headers.contentType,
    cacheControl: response.headers.cacheControl,
    xRobotsTag: response.headers.xRobotsTag,
  };
}

function safeHeader(value, max = 240) {
  if (!value || /[\r\n\0]/.test(value)) return null;
  return value.slice(0, max);
}

function isJson(response) {
  return /^application\/json(?:;|$)/i.test(response.headers.contentType ?? "");
}

function isHtml(response) {
  return /^text\/html(?:;|$)/i.test(response.headers.contentType ?? "");
}

function isXml(response) {
  return /^(?:application|text)\/(?:xml|[^;]+\+xml)(?:;|$)/i.test(response.headers.contentType ?? "");
}

function noStore(response) {
  return /(?:^|,)\s*no-store(?:\s*(?:,|$)|\s*=)/i.test(response.headers.cacheControl ?? "");
}

function notPubliclyCached(response) {
  const value = response.headers.cacheControl ?? "";
  for (const directive of ["s-maxage", "stale-while-revalidate", "stale-if-error"]) {
    const match = value.match(new RegExp(`(?:^|,)\\s*${directive}\\s*=\\s*(\\d+)`, "i"));
    if (match && Number(match[1]) > 0) return false;
  }
  if (/(?:^|,)\s*public(?:\s*(?:,|$))/i.test(value)) {
    const browserMaxAge = value.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/i);
    return browserMaxAge !== null && Number(browserMaxAge[1]) === 0;
  }
  return true;
}

function cleanText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function tagAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/\b([a-zA-Z][\w:-]*)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    attributes[match[1].toLowerCase()] = decodeHtmlAttribute(match[3]);
  }
  return attributes;
}

function hasCanonical(html, expected) {
  return (html.match(/<link\b[^>]*>/gi) ?? []).some((tag) => {
    const attributes = tagAttributes(tag);
    return attributes.rel?.toLowerCase().split(/\s+/).includes("canonical") && attributes.href === expected;
  });
}

function robotsMetaAllowsIndex(html) {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).some((tag) => {
    const attributes = tagAttributes(tag);
    if (attributes.name?.toLowerCase() !== "robots") return false;
    const directives = (attributes.content ?? "").toLowerCase().split(",").map((value) => value.trim());
    return directives.includes("index") && directives.includes("follow") && !directives.includes("noindex");
  });
}

function robotsMetaBlocksIndex(html) {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).some((tag) => {
    const attributes = tagAttributes(tag);
    if (attributes.name?.toLowerCase() !== "robots") return false;
    const directives = (attributes.content ?? "").toLowerCase().split(",").map((value) => value.trim());
    return directives.includes("noindex") && directives.includes("nofollow") && !directives.includes("index");
  });
}

function xRobotsHeaderAllowsIndex(response) {
  const value = response.headers.xRobotsTag?.toLowerCase() ?? "";
  return !/(?:^|[\s,;])(?:noindex|nofollow|none)(?:$|[\s,;])/i.test(value);
}

function hasHref(html, expectedPath) {
  return (html.match(/<a\b[^>]*>/gi) ?? []).some((tag) => tagAttributes(tag).href === expectedPath);
}

function noFanwardPreviewWording(html) {
  const text = cleanText(html).toLowerCase();
  return !/fanward.{0,90}(?:preview|coming soon)|(?:preview|coming soon).{0,90}fanward/i.test(text);
}

function forbiddenPublicKeys(value, path = "data") {
  const forbidden = new Set([
    "audit",
    "auditlog",
    "email",
    "moderation",
    "owner",
    "owneremail",
    "ownerid",
    "owneruserid",
    "pendingrevision",
    "publishedrevision",
    "reviewreason",
    "revisions",
    "userid",
  ]);
  if (!value || typeof value !== "object") return [];
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbidden.has(key.toLowerCase())) found.push(childPath);
    if (found.length < 10) found.push(...forbiddenPublicKeys(child, childPath));
    if (found.length >= 10) break;
  }
  return found.slice(0, 10);
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function validPublicCategory(value) {
  return value === null || (
    hasExactKeys(value, ["id", "slug", "name"])
    && typeof value.id === "string"
    && typeof value.slug === "string"
    && typeof value.name === "string"
  );
}

function validImpactComponent(value) {
  return hasExactKeys(value, ["score", "available", "configuredWeight", "appliedWeight"])
    && (value.score === null || (Number.isFinite(value.score) && value.score >= 0 && value.score <= 100))
    && typeof value.available === "boolean"
    && Number.isFinite(value.configuredWeight)
    && value.configuredWeight >= 0
    && value.configuredWeight <= 1
    && Number.isFinite(value.appliedWeight)
    && value.appliedWeight >= 0
    && value.appliedWeight <= 1;
}

function validPublicImpact(value) {
  const componentNames = ["verifiedReach", "attentionMomentum", "engagementQuality", "trustConfidence"];
  const rankingStates = ["unverified", "building_baseline", "provisional", "eligible", "stale", "suspended", "fraud_review", "ineligible"];
  const configuredWeights = { verifiedReach: 0.3, attentionMomentum: 0.3, engagementQuality: 0.2, trustConfidence: 0.2 };
  const shapeValid = hasExactKeys(value, ["score", "state", "confidence", "version", "sourceVersion", "source", "updatedAt", "components"])
    && (value.score === null || (Number.isFinite(value.score) && value.score >= 0 && value.score <= 100))
    && rankingStates.includes(value.state)
    && Number.isFinite(value.confidence)
    && value.confidence >= 0
    && value.confidence <= 1
    && value.version === "fanward-impact-v1"
    && (value.sourceVersion === null || typeof value.sourceVersion === "string")
    && ["tracker", "ga4"].includes(value.source)
    && (value.updatedAt === null || isIsoTimestamp(value.updatedAt))
    && hasExactKeys(value.components, componentNames)
    && componentNames.every((name) => validImpactComponent(value.components[name]));
  if (!shapeValid) return false;
  if (!componentNames.every((name) => value.components[name].configuredWeight === configuredWeights[name])) return false;

  const failClosed = ["unverified", "building_baseline", "suspended", "fraud_review", "ineligible"].includes(value.state);
  if (failClosed && value.score !== null) return false;
  if (value.state === "provisional" && value.score !== null && value.score > 79) return false;
  if (value.state === "stale" && value.score !== null && value.score > 60) return false;
  const appliedWeightSum = componentNames.reduce((sum, name) => sum + value.components[name].appliedWeight, 0);
  return value.score === null ? Math.abs(appliedWeightSum) < 0.000_001 : Math.abs(appliedWeightSum - 1) < 0.000_001;
}

function validPublicCreator(value, { detail = false } = {}) {
  const keys = ["slug", "displayName", "headline", "bioExcerpt", ...(detail ? ["bio"] : []), "category", "logoUrl", "primarySite", "impact", "publishedAt"];
  return hasExactKeys(value, keys)
    && typeof value.slug === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)
    && typeof value.displayName === "string"
    && typeof value.headline === "string"
    && typeof value.bioExcerpt === "string"
    && (!detail || typeof value.bio === "string")
    && validPublicCategory(value.category)
    && (value.logoUrl === null || typeof value.logoUrl === "string")
    && hasExactKeys(value.primarySite, ["slug", "name", "domain", "verification"])
    && typeof value.primarySite.slug === "string"
    && typeof value.primarySite.name === "string"
    && typeof value.primarySite.domain === "string"
    && ["tracker", "ga4"].includes(value.primarySite.verification)
    && validPublicImpact(value.impact)
    && isIsoTimestamp(value.publishedAt);
}

function exactDirective(text, directive, path) {
  const expected = `${directive}: ${path}`.toLowerCase();
  return text.split(/\r?\n/).some((line) => line.trim().toLowerCase() === expected);
}

function xmlLocations(xml) {
  return new Set(
    [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeHtmlAttribute(match[1].trim())),
  );
}

function requestId(mode, runToken, index) {
  return `fanward-readback-${mode.replace(/[^a-z]/g, "")}-${runToken}-${String(index).padStart(2, "0")}`;
}

async function readLimitedBody(response) {
  if (!response.body) return "";
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) {
      await response.body.cancel().catch(() => undefined);
      const error = new Error("response_body_too_large");
      error.name = "BodyLimitError";
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function requestFactory(config) {
  let index = 0;
  return async function request(path, { authenticated = false, accept = "*/*" } = {}) {
    index += 1;
    const expectedRequestId = requestId(config.mode, config.runToken, index);
    const url = new URL(path, config.baseUrl);
    const headers = new Headers({
      accept,
      "user-agent": `surgeindex-fanward-readback/${SCHEMA_VERSION}`,
      "x-request-id": expectedRequestId,
    });
    if (config.hostOverride) headers.set("host", config.hostOverride);
    if (config.trustedClientIpOverride) headers.set("x-real-ip", config.trustedClientIpOverride);
    if (config.basicAuth) headers.set("authorization", config.basicAuth);
    if (authenticated && config.adminCookie) headers.set("cookie", config.adminCookie);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      const text = await readLimitedBody(response);
      let json = null;
      if (/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      return {
        status: response.status,
        requestId: expectedRequestId,
        responseRequestId: safeHeader(response.headers.get("x-request-id"), 100),
        headers: {
          contentType: safeHeader(response.headers.get("content-type")),
          cacheControl: safeHeader(response.headers.get("cache-control")),
          xRobotsTag: safeHeader(response.headers.get("x-robots-tag")),
          location: safeHeader(response.headers.get("location")),
        },
        text,
        json,
        errorType: null,
      };
    } catch (error) {
      return {
        status: null,
        requestId: expectedRequestId,
        responseRequestId: null,
        headers: { contentType: null, cacheControl: null, xRobotsTag: null, location: null },
        text: "",
        json: null,
        errorType: error instanceof Error ? error.name : "UnknownError",
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

function check(id, assertions, { status = null, headers = null, facts = {}, errorType = null } = {}) {
  const pass = Object.values(assertions).every((value) => value === true);
  return {
    id,
    result: pass ? "PASS" : "FAIL",
    status,
    assertions,
    ...(headers ? { headers } : {}),
    facts,
    errorType,
  };
}

function notRun(id, reason) {
  return {
    id,
    result: "NOT_RUN",
    status: null,
    assertions: {},
    facts: { reason },
    errorType: null,
  };
}

async function releaseIdentityCheck(config) {
  let resolvedToolRoot = null;
  let resolvedWorkingDirectory = null;
  let resolvedExpectedRelease = null;
  let releaseEnvSha = null;
  let gitHeadSha = null;
  let trackedTreeClean = false;
  let errorType = null;
  try {
    [resolvedToolRoot, resolvedWorkingDirectory, resolvedExpectedRelease] = await Promise.all([
      realpath(toolRoot),
      realpath(process.cwd()),
      realpath(config.releaseDirectory),
    ]);
    const releaseEnv = await readFile(resolve(resolvedToolRoot, "release.env"), "utf8");
    const matches = [...releaseEnv.matchAll(/^BUILD_SHA=([0-9a-f]{40})$/gim)];
    releaseEnvSha = matches.length === 1 ? matches[0][1].toLowerCase() : null;
    const head = spawnSync("git", ["-C", resolvedToolRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    const normalizedHead = head.status === 0 ? head.stdout.trim().toLowerCase() : "";
    gitHeadSha = /^[0-9a-f]{40}$/.test(normalizedHead) ? normalizedHead : null;
    const trackedDiff = spawnSync("git", ["-C", resolvedToolRoot, "diff", "--quiet", "HEAD", "--"], {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    trackedTreeClean = !trackedDiff.error && trackedDiff.signal === null && trackedDiff.status === 0;
  } catch (error) {
    errorType = error instanceof Error ? error.name : "UnknownError";
  }
  return check("release.tool-identity", {
    workingDirectoryIsToolRoot: resolvedWorkingDirectory !== null && resolvedWorkingDirectory === resolvedToolRoot,
    expectedReleaseIsToolRoot: resolvedExpectedRelease !== null && resolvedExpectedRelease === resolvedToolRoot,
    releaseEnvHasOneExactSha: releaseEnvSha !== null,
    toolShaMatchesReleaseEnv: releaseEnvSha === config.toolSha,
    gitHeadIsExactSha: gitHeadSha !== null,
    toolShaMatchesGitHead: gitHeadSha === config.toolSha,
    trackedTreeClean,
    targetRelationshipCorrect: config.mode === "rollback-rehearsal"
      ? config.expectedSha !== config.toolSha
      : config.expectedSha === config.toolSha,
  }, {
    facts: {
      toolSha: config.toolSha,
      targetSha: config.expectedSha,
      sameToolAndTargetSha: config.toolSha === config.expectedSha,
      gitHeadMatchesToolSha: gitHeadSha === config.toolSha,
      trackedTreeClean,
    },
    errorType,
  });
}

function launchGateCheck(config) {
  const gateArgument = config.mode === "rollback-rehearsal" ? "--strict-public-free" : "--strict-fanward-mvp";
  const gateEnvironment = { ...process.env };
  delete gateEnvironment.FANWARD_READBACK_ADMIN_COOKIE;
  delete gateEnvironment.FANWARD_READBACK_BASIC_AUTH;
  const result = spawnSync(process.execPath, [resolve(toolRoot, "scripts/launch-gates.mjs"), gateArgument], {
    cwd: toolRoot,
    env: gateEnvironment,
    encoding: "utf8",
    timeout: Math.max(10_000, config.timeoutMs * 2),
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  let output = null;
  try {
    output = JSON.parse(result.stdout || "null");
  } catch {
    output = null;
  }
  const gate = config.mode === "rollback-rehearsal" ? output?.gates?.publicFree : output?.gates?.fanwardMvp;
  const core = gate?.checks ?? {};
  const commercialBoundary = [
    core.publicCommercialUiDisabled,
    core.publicRadarDisabled,
    core.commercialBackendsDisabled,
    core.paidPlacementsDisabled,
    core.publicRevenueDisabled,
    core.publicPageMetricsDisabled,
  ].every((value) => value === true);
  const featureBoundary = config.mode === "rollback-rehearsal"
    ? core.futureFeaturesDisabled === true
    : core.creatorsEnabled === true && core.nonFanwardFutureFeaturesDisabled === true;
  return check("configuration.launch-gate", {
    processCompleted: !result.error && result.signal === null,
    exitCodeZero: result.status === 0,
    outputIsJson: output !== null,
    selectedGateReady: gate?.ready === true,
    expectedMigrationCountIs15: core.expectedMigrationCount === true,
    commercialBoundaryDisabled: commercialBoundary,
    featureBoundaryCorrect: featureBoundary,
    secretsNotPrintedByGate: output?.secretsPrinted === false,
  }, {
    facts: {
      gateProfile: config.mode === "rollback-rehearsal" ? "public-free-schema-15" : "fanward-mvp",
      exitCode: result.status,
    },
    errorType: result.error instanceof Error ? result.error.name : null,
  });
}

async function commonHealthChecks(config, request) {
  const live = await request("/api/health/live", { accept: "application/json" });
  const ready = await request("/api/health/ready", { accept: "application/json" });
  return [
    check("health.live", {
      status200: live.status === 200,
      jsonContentType: isJson(live),
      bodyParsed: live.json !== null,
      serviceIsWeb: live.json?.data?.service === "surgeindex-web",
      statusIsOk: live.json?.data?.status === "ok",
      exactTargetSha: live.json?.data?.build === config.expectedSha,
      requestIdRoundTrip: live.responseRequestId === live.requestId && live.json?.requestId === live.requestId,
      notPubliclyCached: notPubliclyCached(live),
    }, {
      status: live.status,
      headers: headerSummary(live),
      facts: { expectedSha: config.expectedSha, buildMatches: live.json?.data?.build === config.expectedSha },
      errorType: live.errorType,
    }),
    check("health.ready", {
      status200: ready.status === 200,
      jsonContentType: isJson(ready),
      bodyParsed: ready.json !== null,
      ready: ready.json?.data?.ready === true,
      productionMode: ready.json?.data?.mode === "production",
      databaseReady: ready.json?.data?.checks?.database === true,
      migrationsReady: ready.json?.data?.checks?.migrations === true,
      expectedMigrationCount15: Number(ready.json?.data?.expectedMigrationCount) === 15,
      requestIdRoundTrip: ready.responseRequestId === ready.requestId && ready.json?.requestId === ready.requestId,
      notPubliclyCached: notPubliclyCached(ready),
    }, {
      status: ready.status,
      headers: headerSummary(ready),
      facts: { expectedMigrationCount: Number(ready.json?.data?.expectedMigrationCount) || null },
      errorType: ready.errorType,
    }),
  ];
}

function redirectMatches(location, publicOrigin, expectedPath) {
  if (!location) return false;
  try {
    const target = new URL(location, publicOrigin);
    return target.origin === publicOrigin && target.pathname === expectedPath && !target.search && !target.hash;
  } catch {
    return false;
  }
}

async function legacyRedirectCheck(request, publicOrigin) {
  const response = await request("/creators", { accept: "text/html" });
  return check("routing.legacy-creators", {
    permanentRedirect308: response.status === 308,
    locationIsFanward: redirectMatches(response.headers.location, publicOrigin, "/fanward"),
  }, {
    status: response.status,
    headers: headerSummary(response),
    facts: { locationMatches: redirectMatches(response.headers.location, publicOrigin, "/fanward") },
    errorType: response.errorType,
  });
}

async function fanwardEnabledChecks(config, request) {
  const checks = [];
  const publicOrigin = config.publicOrigin.origin;

  const directoryPage = await request("/fanward", { accept: "text/html" });
  const directoryText = cleanText(directoryPage.text);
  checks.push(check("fanward.directory-page", {
    status200: directoryPage.status === 200,
    htmlContentType: isHtml(directoryPage),
    canonicalIsFanward: hasCanonical(directoryPage.text, `${publicOrigin}/fanward`),
    robotsAllowIndexFollow: robotsMetaAllowsIndex(directoryPage.text),
    xRobotsHeaderAllowsIndex: xRobotsHeaderAllowsIndex(directoryPage),
    surfaceCopyPresent: /Creator attention, with the evidence attached\./i.test(directoryText),
    noPreviewOrComingSoonWording: noFanwardPreviewWording(directoryPage.text),
    notPubliclyCached: notPubliclyCached(directoryPage),
  }, {
    status: directoryPage.status,
    headers: headerSummary(directoryPage),
    facts: { canonicalMatches: hasCanonical(directoryPage.text, `${publicOrigin}/fanward`) },
    errorType: directoryPage.errorType,
  }));

  const publicApi = await request("/api/fanward/creators?limit=1", { accept: "application/json" });
  const publicData = publicApi.json?.data;
  const creators = Array.isArray(publicData?.creators) ? publicData.creators : null;
  const categories = Array.isArray(publicData?.categories) ? publicData.categories : null;
  const total = Number.isInteger(publicData?.total) ? publicData.total : null;
  const forbiddenKeys = forbiddenPublicKeys(publicData);
  const shapeValid = hasExactKeys(publicData, ["creators", "nextCursor", "total", "categories"])
    && creators !== null
    && categories !== null
    && total !== null
    && total >= 0
    && creators.length <= 1
    && creators.every((creator) => validPublicCreator(creator))
    && categories.every((category) => validPublicCategory(category) && category !== null)
    && total >= creators.length
    && (publicData.nextCursor === null || typeof publicData.nextCursor === "string");
  checks.push(check("fanward.public-api", {
    status200: publicApi.status === 200,
    jsonContentType: isJson(publicApi),
    bodyParsed: publicApi.json !== null,
    responseShapeValid: shapeValid,
    oneItemLimitHonored: creators !== null && creators.length <= 1,
    emptyDirectoryConsistent: total !== 0 || creators?.length === 0,
    nonemptyDirectoryConsistent: total === 0 || creators?.length === 1,
    publicProjectionHasNoPrivateKeys: forbiddenKeys.length === 0,
    cacheControlNoStore: noStore(publicApi),
    cacheControlNotPublic: notPubliclyCached(publicApi),
    requestIdRoundTrip: publicApi.responseRequestId === publicApi.requestId && publicApi.json?.requestId === publicApi.requestId,
  }, {
    status: publicApi.status,
    headers: headerSummary(publicApi),
    facts: {
      creatorCountReturned: creators?.length ?? null,
      categoryCount: categories?.length ?? null,
      total,
      forbiddenKeyCount: forbiddenKeys.length,
    },
    errorType: publicApi.errorType,
  }));

  checks.push(await legacyRedirectCheck(request, publicOrigin));

  const robots = await request("/robots.txt", { accept: "text/plain" });
  const robotsFanwardAllowed = exactDirective(robots.text, "Allow", "/fanward");
  const robotsFanwardDisallowed = exactDirective(robots.text, "Disallow", "/fanward");
  checks.push(check("seo.robots", {
    status200: robots.status === 200,
    textContentType: /^text\/plain(?:;|$)/i.test(robots.headers.contentType ?? ""),
    fanwardAllowed: robotsFanwardAllowed,
    fanwardNotDisallowed: !robotsFanwardDisallowed,
    legacyCreatorsDisallowed: exactDirective(robots.text, "Disallow", "/creators"),
    dashboardDisallowed: exactDirective(robots.text, "Disallow", "/dashboard"),
    adminDisallowed: exactDirective(robots.text, "Disallow", "/admin"),
    boostDisallowed: exactDirective(robots.text, "Disallow", "/boost"),
    pricingDisallowed: exactDirective(robots.text, "Disallow", "/pricing"),
    bidMomentDisallowed: exactDirective(robots.text, "Disallow", "/bid-the-moment"),
    canonicalSitemap: exactDirective(robots.text, "Sitemap", `${publicOrigin}/sitemap.xml`),
  }, {
    status: robots.status,
    headers: headerSummary(robots),
    facts: { fanwardAllowed: robotsFanwardAllowed, fanwardDisallowed: robotsFanwardDisallowed },
    errorType: robots.errorType,
  }));

  const sitemap = await request("/sitemap.xml", { accept: "application/xml,text/xml" });
  const locations = xmlLocations(sitemap.text);
  const firstCreator = creators?.[0] ?? null;
  const firstSlug = typeof firstCreator?.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(firstCreator.slug)
    ? firstCreator.slug
    : null;
  checks.push(check("seo.sitemap", {
    status200: sitemap.status === 200,
    xmlContentType: isXml(sitemap),
    fanwardDirectoryPresent: locations.has(`${publicOrigin}/fanward`),
    firstPublishedCreatorPresentWhenApplicable: !firstSlug || locations.has(`${publicOrigin}/fanward/${firstSlug}`),
    boostAbsent: !locations.has(`${publicOrigin}/boost`),
    pricingAbsent: !locations.has(`${publicOrigin}/pricing`),
    bidMomentAbsent: !locations.has(`${publicOrigin}/bid-the-moment`),
    xRobotsHeaderAllowsIndex: xRobotsHeaderAllowsIndex(sitemap),
    notPubliclyCached: notPubliclyCached(sitemap),
  }, {
    status: sitemap.status,
    headers: headerSummary(sitemap),
    facts: { fanwardEntryPresent: locations.has(`${publicOrigin}/fanward`), creatorDetailChecked: Boolean(firstSlug) },
    errorType: sitemap.errorType,
  }));

  const homepage = await request("/", { accept: "text/html" });
  const fanwardCtaPresent = hasHref(homepage.text, "/fanward");
  checks.push(check("homepage.fanward-surface", {
    status200: homepage.status === 200,
    htmlContentType: isHtml(homepage),
    fanwardCtaPresent,
    fanwardNamePresent: /\bFanward\b/i.test(cleanText(homepage.text)),
    noFanwardPreviewOrComingSoonWording: noFanwardPreviewWording(homepage.text),
    noBoostCta: !hasHref(homepage.text, "/boost"),
    noPricingCta: !hasHref(homepage.text, "/pricing"),
    noBidMomentCta: !hasHref(homepage.text, "/bid-the-moment"),
    robotsDoNotBlockIndex: !/content=["'][^"']*noindex/i.test(homepage.text),
    xRobotsHeaderAllowsIndex: xRobotsHeaderAllowsIndex(homepage),
    notPubliclyCached: notPubliclyCached(homepage),
  }, {
    status: homepage.status,
    headers: headerSummary(homepage),
    facts: { fanwardCtaPresent },
    errorType: homepage.errorType,
  }));

  const anonymousAdmin = await request("/api/admin/fanward?limit=1", { accept: "application/json" });
  checks.push(check("admin.unauthorized-rejected", {
    rejected: anonymousAdmin.status === 401 || anonymousAdmin.status === 403,
    jsonContentType: isJson(anonymousAdmin),
    applicationAuthError: ["authentication_required", "admin_required"].includes(anonymousAdmin.json?.error?.code),
    cacheControlNoStore: noStore(anonymousAdmin),
    cacheControlNotPublic: notPubliclyCached(anonymousAdmin),
    requestIdRoundTrip: anonymousAdmin.responseRequestId === anonymousAdmin.requestId && anonymousAdmin.json?.error?.requestId === anonymousAdmin.requestId,
  }, {
    status: anonymousAdmin.status,
    headers: headerSummary(anonymousAdmin),
    facts: { applicationAuthRejected: ["authentication_required", "admin_required"].includes(anonymousAdmin.json?.error?.code) },
    errorType: anonymousAdmin.errorType,
  }));

  const anonymousOwner = await request("/api/fanward/me", { accept: "application/json" });
  checks.push(check("owner.unauthorized-rejected", {
    status401: anonymousOwner.status === 401,
    jsonContentType: isJson(anonymousOwner),
    authenticationRequired: anonymousOwner.json?.error?.code === "authentication_required",
    cacheControlNoStore: noStore(anonymousOwner),
    cacheControlNotPublic: notPubliclyCached(anonymousOwner),
    requestIdRoundTrip: anonymousOwner.responseRequestId === anonymousOwner.requestId
      && anonymousOwner.json?.error?.requestId === anonymousOwner.requestId,
  }, {
    status: anonymousOwner.status,
    headers: headerSummary(anonymousOwner),
    facts: { authenticationRequired: anonymousOwner.json?.error?.code === "authentication_required" },
    errorType: anonymousOwner.errorType,
  }));

  if (config.adminCookie) {
    const authenticatedAdmin = await request("/api/admin/fanward?limit=1&offset=0", { authenticated: true, accept: "application/json" });
    const queue = authenticatedAdmin.json?.data;
    const queueShapeValid = Array.isArray(queue?.items)
      && Number.isInteger(queue?.total)
      && queue.total >= queue.items.length
      && queue.limit === 1
      && queue.offset === 0
      && (queue.nextOffset === null || Number.isInteger(queue.nextOffset));
    checks.push(check("admin.authenticated-queue", {
      status200: authenticatedAdmin.status === 200,
      jsonContentType: isJson(authenticatedAdmin),
      responseShapeValid: queueShapeValid,
      cacheControlPrivate: /(?:^|,)\s*private(?:\s*(?:,|$))/i.test(authenticatedAdmin.headers.cacheControl ?? ""),
      cacheControlNoStore: noStore(authenticatedAdmin),
      cacheControlNotPublic: notPubliclyCached(authenticatedAdmin),
      requestIdRoundTrip: authenticatedAdmin.responseRequestId === authenticatedAdmin.requestId && authenticatedAdmin.json?.requestId === authenticatedAdmin.requestId,
    }, {
      status: authenticatedAdmin.status,
      headers: headerSummary(authenticatedAdmin),
      facts: { queueItemCount: Array.isArray(queue?.items) ? queue.items.length : null, total: Number.isInteger(queue?.total) ? queue.total : null },
      errorType: authenticatedAdmin.errorType,
    }));
  } else {
    checks.push(notRun("admin.authenticated-queue", "ephemeral_admin_session_not_supplied"));
  }

  if (firstSlug) {
    const detailApi = await request(`/api/fanward/creators/${encodeURIComponent(firstSlug)}`, { accept: "application/json" });
    const detailForbiddenKeys = forbiddenPublicKeys(detailApi.json?.data);
    checks.push(check("fanward.public-detail-api", {
      status200: detailApi.status === 200,
      jsonContentType: isJson(detailApi),
      slugMatchesDirectory: detailApi.json?.data?.slug === firstSlug,
      responseShapeStrictlyPublic: validPublicCreator(detailApi.json?.data, { detail: true }),
      publicProjectionHasNoPrivateKeys: detailForbiddenKeys.length === 0,
      cacheControlNoStore: noStore(detailApi),
      cacheControlNotPublic: notPubliclyCached(detailApi),
      requestIdRoundTrip: detailApi.responseRequestId === detailApi.requestId && detailApi.json?.requestId === detailApi.requestId,
    }, {
      status: detailApi.status,
      headers: headerSummary(detailApi),
      facts: { slugMatches: detailApi.json?.data?.slug === firstSlug, forbiddenKeyCount: detailForbiddenKeys.length },
      errorType: detailApi.errorType,
    }));

    const detailPage = await request(`/fanward/${encodeURIComponent(firstSlug)}`, { accept: "text/html" });
    checks.push(check("fanward.public-detail-page", {
      status200: detailPage.status === 200,
      htmlContentType: isHtml(detailPage),
      canonicalMatches: hasCanonical(detailPage.text, `${publicOrigin}/fanward/${firstSlug}`),
      robotsAllowIndexFollow: robotsMetaAllowsIndex(detailPage.text),
      xRobotsHeaderAllowsIndex: xRobotsHeaderAllowsIndex(detailPage),
      noPreviewOrComingSoonWording: noFanwardPreviewWording(detailPage.text),
      notPubliclyCached: notPubliclyCached(detailPage),
    }, {
      status: detailPage.status,
      headers: headerSummary(detailPage),
      facts: { canonicalMatches: hasCanonical(detailPage.text, `${publicOrigin}/fanward/${firstSlug}`) },
      errorType: detailPage.errorType,
    }));
  } else {
    checks.push(check("fanward.truthful-empty-state", {
      publicApiSucceeded: publicApi.status === 200,
      totalIsZero: total === 0,
      creatorsAreEmpty: creators?.length === 0,
      directoryPageSucceeded: directoryPage.status === 200,
      emptyStateHeadingPresent: /The creator directory is getting started/i.test(directoryText),
      noApprovedProfileCopyPresent: /There are no approved creator profiles yet/i.test(directoryText),
    }, {
      status: directoryPage.status,
      headers: headerSummary(directoryPage),
      facts: { emptyDirectory: total === 0 && creators?.length === 0 },
      errorType: directoryPage.errorType || publicApi.errorType,
    }));
  }

  return checks;
}

async function rollbackRehearsalChecks(config, request) {
  const checks = [];
  const publicOrigin = config.publicOrigin.origin;

  const fanwardPage = await request("/fanward", { accept: "text/html" });
  const fanwardText = cleanText(fanwardPage.text);
  checks.push(check("rollback.fanward-preview-contained", {
    status200: fanwardPage.status === 200,
    htmlContentType: isHtml(fanwardPage),
    robotsBlockIndexAndFollow: robotsMetaBlocksIndex(fanwardPage.text),
    comingSoonBoundaryVisible: /coming soon/i.test(fanwardText),
    previewBoundaryVisible: /Fanward is clearly marked as a preview\./i.test(fanwardText),
    noApprovedDirectoryCopy: !/Creator attention, with the evidence attached\./i.test(fanwardText),
  }, {
    status: fanwardPage.status,
    headers: headerSummary(fanwardPage),
    errorType: fanwardPage.errorType,
  }));

  const fanwardApi = await request("/api/fanward/creators?limit=1", { accept: "application/json" });
  checks.push(check("rollback.fanward-api-disabled", {
    status404: fanwardApi.status === 404,
    noFanwardDataPayload: fanwardApi.json?.data === undefined,
    notPubliclyCached: notPubliclyCached(fanwardApi),
  }, {
    status: fanwardApi.status,
    headers: headerSummary(fanwardApi),
    errorType: fanwardApi.errorType,
  }));

  const legacyPage = await request("/creators", { accept: "text/html" });
  const legacyText = cleanText(legacyPage.text);
  checks.push(check("rollback.legacy-preview-contained", {
    status200: legacyPage.status === 200,
    htmlContentType: isHtml(legacyPage),
    robotsBlockIndexAndFollow: robotsMetaBlocksIndex(legacyPage.text),
    comingSoonBoundaryVisible: /coming soon/i.test(legacyText),
    previewBoundaryVisible: /Fanward is clearly marked as a preview\./i.test(legacyText),
  }, {
    status: legacyPage.status,
    headers: headerSummary(legacyPage),
    errorType: legacyPage.errorType,
  }));

  const robots = await request("/robots.txt", { accept: "text/plain" });
  checks.push(check("rollback.robots-public-free", {
    status200: robots.status === 200,
    fanwardDisallowed: exactDirective(robots.text, "Disallow", "/fanward"),
    fanwardNotAllowed: !exactDirective(robots.text, "Allow", "/fanward"),
    legacyCreatorsDisallowed: exactDirective(robots.text, "Disallow", "/creators"),
    boostDisallowed: exactDirective(robots.text, "Disallow", "/boost"),
    pricingDisallowed: exactDirective(robots.text, "Disallow", "/pricing"),
    bidMomentDisallowed: exactDirective(robots.text, "Disallow", "/bid-the-moment"),
    canonicalSitemap: exactDirective(robots.text, "Sitemap", `${publicOrigin}/sitemap.xml`),
  }, {
    status: robots.status,
    headers: headerSummary(robots),
    errorType: robots.errorType,
  }));

  const sitemap = await request("/sitemap.xml", { accept: "application/xml,text/xml" });
  const locations = xmlLocations(sitemap.text);
  checks.push(check("rollback.sitemap-public-free", {
    status200: sitemap.status === 200,
    xmlContentType: isXml(sitemap),
    fanwardAbsent: !locations.has(`${publicOrigin}/fanward`) && ![...locations].some((value) => value.startsWith(`${publicOrigin}/fanward/`)),
    boostAbsent: !locations.has(`${publicOrigin}/boost`),
    pricingAbsent: !locations.has(`${publicOrigin}/pricing`),
    bidMomentAbsent: !locations.has(`${publicOrigin}/bid-the-moment`),
    xRobotsHeaderAllowsIndex: xRobotsHeaderAllowsIndex(sitemap),
    notPubliclyCached: notPubliclyCached(sitemap),
  }, {
    status: sitemap.status,
    headers: headerSummary(sitemap),
    errorType: sitemap.errorType,
  }));

  const homepage = await request("/", { accept: "text/html" });
  checks.push(check("rollback.homepage-public-free", {
    status200: homepage.status === 200,
    htmlContentType: isHtml(homepage),
    knownFanwardPreviewLinkPresent: hasHref(homepage.text, "/fanward"),
    knownFanwardPreviewBoundaryVisible: /Fanward\s*preview/i.test(cleanText(homepage.text)),
    activeFanwardDirectoryCopyAbsent: !/Creator attention, with the evidence attached\./i.test(cleanText(homepage.text)),
    boostCtaAbsent: !hasHref(homepage.text, "/boost"),
    pricingCtaAbsent: !hasHref(homepage.text, "/pricing"),
    bidMomentCtaAbsent: !hasHref(homepage.text, "/bid-the-moment"),
    xRobotsHeaderAllowsIndex: xRobotsHeaderAllowsIndex(homepage),
  }, {
    status: homepage.status,
    headers: headerSummary(homepage),
    errorType: homepage.errorType,
  }));

  const tracker = await request("/tracker.js", { accept: "application/javascript,text/javascript,*/*" });
  checks.push(check("rollback.tracker-artifact", {
    status200: tracker.status === 200,
    javascriptContentType: /(?:application|text)\/javascript/i.test(tracker.headers.contentType ?? ""),
    artifactIsNontrivial: Buffer.byteLength(tracker.text, "utf8") >= 1_024,
  }, {
    status: tracker.status,
    headers: headerSummary(tracker),
    facts: { artifactAtLeast1KiB: Buffer.byteLength(tracker.text, "utf8") >= 1_024 },
    errorType: tracker.errorType,
  }));

  if (config.adminCookie) {
    const session = await request("/api/auth/get-session", { authenticated: true, accept: "application/json" });
    checks.push(check("rollback.auth-session", {
      status200: session.status === 200,
      jsonContentType: isJson(session),
      authenticatedSessionPresent: Boolean(session.json?.user || session.json?.session),
      notPubliclyCached: notPubliclyCached(session),
    }, {
      status: session.status,
      headers: headerSummary(session),
      facts: { authenticatedSessionPresent: Boolean(session.json?.user || session.json?.session) },
      errorType: session.errorType,
    }));

    for (const [id, path] of [
      ["rollback.jobs-health", "/api/admin/jobs/health"],
      ["rollback.scoring-health", "/api/admin/scoring/health"],
      ["rollback.traffic-health", "/api/admin/traffic/summary"],
    ]) {
      const response = await request(path, { authenticated: true, accept: "application/json" });
      checks.push(check(id, {
        status200: response.status === 200,
        jsonContentType: isJson(response),
        bodyParsed: response.json !== null,
        notPubliclyCached: notPubliclyCached(response),
      }, {
        status: response.status,
        headers: headerSummary(response),
        errorType: response.errorType,
      }));
    }
  } else {
    checks.push(notRun("rollback.auth-session", "ephemeral_admin_session_not_supplied"));
    checks.push(notRun("rollback.jobs-health", "ephemeral_admin_session_not_supplied"));
    checks.push(notRun("rollback.scoring-health", "ephemeral_admin_session_not_supplied"));
    checks.push(notRun("rollback.traffic-health", "ephemeral_admin_session_not_supplied"));
  }

  return checks;
}

async function writeEvidence(file, evidence) {
  const directory = dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}

function summarize(checks) {
  return {
    passed: checks.filter((item) => item.result === "PASS").length,
    failed: checks.filter((item) => item.result === "FAIL").length,
    notRun: checks.filter((item) => item.result === "NOT_RUN").length,
  };
}

function finalResult(summary) {
  if (summary.failed > 0) return "FAIL";
  if (summary.notRun > 0) return "PARTIAL";
  return "PASS";
}

async function main() {
  const mode = parseMode();
  const deployment = parseDeployment(mode);
  const allowLocalHttp = yes("FANWARD_READBACK_ALLOW_HTTP_LOCAL");
  const expectedSha = parseSha("FANWARD_READBACK_EXPECTED_SHA");
  const toolSha = parseSha("FANWARD_READBACK_TOOL_SHA", expectedSha);
  const releaseDirectory = required("FANWARD_READBACK_RELEASE_DIR");
  const evidenceFile = required("FANWARD_READBACK_EVIDENCE_FILE");
  if (!isAbsolute(releaseDirectory)) configurationError("fanward_readback_release_dir_must_be_absolute");
  if (!isAbsolute(evidenceFile)) configurationError("fanward_readback_evidence_file_must_be_absolute");

  const baseUrl = parseOrigin("FANWARD_READBACK_BASE_URL", { allowLocalHttp });
  const publicOrigin = parseOrigin("FANWARD_READBACK_PUBLIC_ORIGIN");
  const adminCookie = parseSecretHeader("FANWARD_READBACK_ADMIN_COOKIE", { requireEquals: true });
  const basicAuth = basicAuthorization(parseSecretHeader("FANWARD_READBACK_BASIC_AUTH"));
  const config = {
    mode,
    deployment,
    expectedSha,
    toolSha,
    releaseDirectory,
    evidenceFile,
    baseUrl,
    publicOrigin,
    hostOverride: parseHostOverride(),
    adminCookie,
    basicAuth,
    allowLocalHttp,
    runToken: randomBytes(4).toString("hex"),
    timeoutMs: parseTimeout(),
    trustedClientIpOverride: null,
  };
  validateTargetBinding(config);
  config.trustedClientIpOverride = parseTrustedClientIpOverride(config);

  const request = await requestFactory(config);
  const checks = [
    await releaseIdentityCheck(config),
    launchGateCheck(config),
    ...await commonHealthChecks(config, request),
    ...(mode === "rollback-rehearsal"
      ? await rollbackRehearsalChecks(config, request)
      : await fanwardEnabledChecks(config, request)),
  ];
  const summary = summarize(checks);
  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    kind: "fanward-exact-sha-readback",
    result: finalResult(summary),
    mode,
    deployment,
    generatedAt: new Date().toISOString(),
    target: {
      expectedSha,
      toolSha,
      baseOrigin: baseUrl.origin,
      publicOrigin: publicOrigin.origin,
      hostOverrideProvided: Boolean(config.hostOverride),
      trustedClientIpOverrideProvided: Boolean(config.trustedClientIpOverride),
      trustedClientIpOverride: config.trustedClientIpOverride,
    },
    execution: {
      releaseDirectory,
      evidenceFile,
      adminSessionProvided: Boolean(adminCookie),
      basicAuthProvided: Boolean(basicAuth),
      requestIdRunToken: config.runToken,
      manualRedirects: true,
      timeoutMs: config.timeoutMs,
      readOnlyRequestsOnly: true,
      secretsPrinted: false,
    },
    summary,
    checks,
  };

  await writeEvidence(evidenceFile, evidence);
  console.log(JSON.stringify(evidence, null, 2));
  if (evidence.result === "FAIL") process.exitCode = 1;
  if (evidence.result === "PARTIAL") process.exitCode = 2;
}

main().catch(async (error) => {
  const errorCode = error instanceof ConfigurationError ? error.code : error instanceof Error ? error.name : "UnknownError";
  const evidenceFile = process.env.FANWARD_READBACK_EVIDENCE_FILE?.trim();
  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    kind: "fanward-exact-sha-readback",
    result: "FAIL",
    mode: process.env.FANWARD_READBACK_MODE?.trim() || null,
    deployment: process.env.FANWARD_READBACK_DEPLOYMENT?.trim() || null,
    generatedAt: new Date().toISOString(),
    execution: { secretsPrinted: false, readOnlyRequestsOnly: true },
    summary: { passed: 0, failed: 1, notRun: 0 },
    checks: [check("readback.configuration", { configurationValid: false }, { facts: { errorCode }, errorType: error instanceof Error ? error.name : "UnknownError" })],
  };
  if (evidenceFile && isAbsolute(evidenceFile)) {
    try {
      await writeEvidence(evidenceFile, evidence);
    } catch {
      // stdout remains the fail-closed evidence channel when the path is not writable.
    }
  }
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = 1;
});
