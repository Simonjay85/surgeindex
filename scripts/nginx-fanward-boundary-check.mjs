import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hardening = readFileSync(resolve(root, "deploy/vps/nginx-http-hardening.conf"), "utf8");
const vhost = readFileSync(resolve(root, "deploy/vps/surgeindex.nginx.conf"), "utf8");
const fanwardPathPattern = "^/(?:fanward(?:/|$)|creators(?:/|$)|sitemap\\.xml$|api/(?:admin/)?fanward(?:/|$)|(?:dashboard|admin)/fanward(?:/|$))";
const fanwardMapHeader = "map $uri $surgeindex_fanward_limit_key {";
const fanwardMap = `${fanwardMapHeader}
    default "";
    ~${fanwardPathPattern} $binary_remote_addr;
}`;
const fanwardZone = "limit_req_zone $surgeindex_fanward_limit_key zone=surgeindex_fanward_public:10m rate=120r/m;";
const protectedNamespaces = [
  { root: "/fanward", exact: false },
  { root: "/creators", exact: false },
  { root: "/sitemap.xml", exact: true },
  { root: "/api/fanward", exact: false },
  { root: "/api/admin/fanward", exact: false },
  { root: "/dashboard/fanward", exact: false },
  { root: "/admin/fanward", exact: false },
];
const allowedDisjointRegexLocations = new Set([
  "location ~ ^/api/(sites|claims|waitlist|collect/)",
]);

function stripComments(value) {
  let output = "";
  let quote = null;
  let escaped = false;
  let comment = false;
  for (const character of value) {
    if (comment) {
      if (character === "\n") {
        comment = false;
        output += character;
      }
      continue;
    }
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      output += character;
      escaped = true;
      continue;
    }
    if (quote) {
      output += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      output += character;
      continue;
    }
    if (character === "#") {
      comment = true;
      continue;
    }
    output += character;
  }
  return output;
}

function closingBrace(value, openingIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openingIndex; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function exactHeaderBlocks(value, header) {
  const clean = stripComments(value);
  const blocks = [];
  let offset = 0;
  while (offset < clean.length) {
    const start = clean.indexOf(header, offset);
    if (start < 0) break;
    const openingIndex = clean.indexOf("{", start);
    const closingIndex = closingBrace(clean, openingIndex);
    if (closingIndex < 0) break;
    blocks.push(clean.slice(start, closingIndex + 1));
    offset = closingIndex + 1;
  }
  return blocks;
}

function directiveBlocks(value, directive) {
  const clean = stripComments(value);
  const blocks = [];
  const pattern = new RegExp(`\\b${directive}\\s*\\{`, "g");
  for (const match of clean.matchAll(pattern)) {
    const openingIndex = clean.indexOf("{", match.index);
    const closingIndex = closingBrace(clean, openingIndex);
    if (closingIndex < 0) continue;
    blocks.push(clean.slice(match.index, closingIndex + 1));
  }
  return blocks;
}

function topLevelLocationBlocks(serverBlock) {
  const clean = stripComments(serverBlock);
  const serverOpening = clean.indexOf("{");
  if (serverOpening < 0) return [];
  const blocks = [];
  let depth = 1;
  let quote = null;
  let escaped = false;
  for (let index = serverOpening + 1; index < clean.length; index += 1) {
    const character = clean[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      continue;
    }
    if (
      depth === 1
      && clean.startsWith("location", index)
      && /\s/.test(clean[index + "location".length] ?? "")
      && !/[A-Za-z0-9_]/.test(clean[index - 1] ?? "")
    ) {
      const openingIndex = clean.indexOf("{", index + "location".length);
      const closingIndex = closingBrace(clean, openingIndex);
      if (openingIndex < 0 || closingIndex < 0) break;
      blocks.push({
        header: clean.slice(index, openingIndex).replace(/\s+/g, " ").trim(),
        block: clean.slice(index, closingIndex + 1),
      });
      index = closingIndex;
    }
  }
  return blocks;
}

function directScopeText(block) {
  const clean = stripComments(block);
  const openingIndex = clean.indexOf("{");
  if (openingIndex < 0) return "";
  let output = "";
  let depth = 1;
  let quote = null;
  let escaped = false;
  for (let index = openingIndex + 1; index < clean.length; index += 1) {
    const character = clean[index];
    if (escaped) {
      if (depth === 1) output += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      if (depth === 1) output += character;
      escaped = true;
      continue;
    }
    if (quote) {
      if (depth === 1) output += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      if (depth === 1) output += character;
      quote = character;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1) output += character;
  }
  return output;
}

function hasNestedBlock(block) {
  const clean = stripComments(block);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (const character of clean) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{" && ++depth > 1) return true;
    if (character === "}") depth -= 1;
  }
  return false;
}

function directiveValues(scope, directive) {
  const values = [];
  const pattern = new RegExp(`\\b${directive}\\s+([^;]+);`, "g");
  for (const match of scope.matchAll(pattern)) values.push(match[1].replace(/\s+/g, " ").trim());
  return values;
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function prefixOverlapsProtected(prefix) {
  return protectedNamespaces.some((namespace) => (
    namespace.root.startsWith(prefix)
    || (!namespace.exact && (prefix === namespace.root || prefix.startsWith(`${namespace.root}/`)))
  ));
}

function locationOverlapsProtected(header) {
  if (/^location\s+~\*?\s+/.test(header)) return !allowedDisjointRegexLocations.has(header);
  const pathMatch = header.match(/^location\s+(?:(=|\^~)\s+)?(.+)$/);
  if (!pathMatch) return true;
  const path = unquote(pathMatch[2]);
  if (path.startsWith("@")) return false;
  if (pathMatch[1] === "=") return new RegExp(fanwardPathPattern).test(path);
  return prefixOverlapsProtected(path);
}

function requireSingleValue(failures, values, expected, label) {
  if (values.length !== 1 || values[0] !== expected) {
    failures.push(`${label}; found ${values.length === 0 ? "none" : values.join(" | ")}`);
  }
}

function effectiveDirective(locationScope, serverScope, name, fallback = null) {
  const locationValues = directiveValues(locationScope, name);
  if (locationValues.length) return locationValues.at(-1);
  const serverValues = directiveValues(serverScope, name);
  return serverValues.length ? serverValues.at(-1) : fallback;
}

function validateHttpBoundary(failures, value, label) {
  const clean = stripComments(value);
  const maps = exactHeaderBlocks(clean, fanwardMapHeader);
  if (maps.length !== 1 || maps[0].replace(/\s+/g, " ").trim() !== fanwardMap.replace(/\s+/g, " ").trim()) {
    failures.push(`${label} must contain exactly one active exact Fanward URI map; found ${maps.length}`);
  }
  const zones = [...clean.matchAll(/^\s*limit_req_zone\s+\$surgeindex_fanward_limit_key\s+zone=surgeindex_fanward_public:10m\s+rate=120r\/m;\s*$/gm)];
  if (zones.length !== 1) failures.push(`${label} must contain exactly one active Fanward limit_req_zone; found ${zones.length}`);
  if (hasRealIpDirective(clean)) {
    failures.push(`${label} violates the direct-Nginx contract with an active real-IP trust directive`);
  }
}

function hasRealIpDirective(value) {
  return /\b(?:set_real_ip_from|real_ip_header|real_ip_recursive)\b/.test(stripComments(value));
}

function validateTargetServer(failures, block, { hostname, port, staging }) {
  const serverScope = directScopeText(block);
  const label = `${hostname} TLS server`;
  requireSingleValue(
    failures,
    directiveValues(serverScope, "limit_req"),
    "zone=surgeindex_fanward_public burst=60 nodelay",
    `${label} does not apply the exact Fanward server-scope budget`,
  );
  requireSingleValue(failures, directiveValues(serverScope, "limit_req_status"), "429", `${label} does not return HTTP 429`);
  requireSingleValue(failures, directiveValues(serverScope, "limit_req_dry_run"), "off", `${label} does not explicitly disable dry-run`);
  if (/\blimit_req_dry_run\s+on\s*;/.test(block)) failures.push(`${label} contains an active dry-run override`);
  if (hasRealIpDirective(block)) failures.push(`${label} violates the direct-Nginx contract with an active real-IP trust directive`);
  if (/\bsatisfy\s+any\s*;/.test(block)) failures.push(`${label} contains satisfy any, which can bypass staging authentication`);
  if (/\binclude\s+[^;]+;/.test(serverScope)) failures.push(`${label} contains a direct include whose routing cannot be associated safely`);
  if (/\brewrite\s+[^;]+;/.test(block)) failures.push(`${label} contains a rewrite that can change the mapped URI`);
  if (/\bif\s*\(/.test(block)) failures.push(`${label} contains an if block that can bypass access phases`);
  if (directiveValues(serverScope, "return").length) failures.push(`${label} contains a direct return that bypasses the canonical route`);
  if (directiveValues(serverScope, "try_files").length || directiveValues(serverScope, "error_page").length) {
    failures.push(`${label} contains a direct internal redirect whose target cannot be associated safely`);
  }

  const locations = topLevelLocationBlocks(block);
  const catchAll = locations.filter((location) => location.header === "location /");
  if (catchAll.length !== 1) {
    failures.push(`${label} must contain exactly one canonical location /; found ${catchAll.length}`);
    return;
  }
  const locationScope = directScopeText(catchAll[0].block);
  if (hasNestedBlock(catchAll[0].block)) failures.push(`${label} catch-all contains an unprovable nested block`);
  if (/\binclude\s+[^;]+;/.test(locationScope)) failures.push(`${label} catch-all contains an include that can override inherited controls`);
  if (directiveValues(locationScope, "return").length) failures.push(`${label} catch-all contains a return that bypasses the upstream`);
  if (directiveValues(locationScope, "try_files").length || directiveValues(locationScope, "error_page").length) {
    failures.push(`${label} catch-all contains an internal redirect whose target cannot be associated safely`);
  }
  requireSingleValue(failures, directiveValues(locationScope, "proxy_pass"), `http://127.0.0.1:${port}`, `${label} catch-all is not pinned to listener ${port}`);
  requireSingleValue(failures, directiveValues(locationScope, "proxy_set_header").filter((value) => value.startsWith("X-Real-IP ")), "X-Real-IP $remote_addr", `${label} catch-all does not overwrite X-Real-IP`);
  requireSingleValue(failures, directiveValues(locationScope, "proxy_set_header").filter((value) => value.startsWith("X-Forwarded-For ")), 'X-Forwarded-For ""', `${label} catch-all does not clear X-Forwarded-For`);
  if (directiveValues(locationScope, "limit_req").length) failures.push(`${label} catch-all overrides the server-scope Fanward limiter`);
  const locationStatuses = directiveValues(locationScope, "limit_req_status");
  if (locationStatuses.length && (locationStatuses.length !== 1 || locationStatuses[0] !== "429")) failures.push(`${label} catch-all overrides the limiter status`);
  const locationDryRuns = directiveValues(locationScope, "limit_req_dry_run");
  if (locationDryRuns.some((value) => value !== "off")) failures.push(`${label} catch-all enables limiter dry-run`);

  const locationAuth = directiveValues(locationScope, "auth_basic");
  const serverAuth = directiveValues(serverScope, "auth_basic");
  const locationAuthFiles = directiveValues(locationScope, "auth_basic_user_file");
  const serverAuthFiles = directiveValues(serverScope, "auth_basic_user_file");
  if (locationAuth.length > 1 || serverAuth.length > 1 || locationAuthFiles.length > 1 || serverAuthFiles.length > 1) {
    failures.push(`${label} has ambiguous duplicate Basic Auth directives`);
  }
  const authBasic = effectiveDirective(locationScope, serverScope, "auth_basic", "off");
  const authFile = effectiveDirective(locationScope, serverScope, "auth_basic_user_file");
  if (staging) {
    const literalRealm = authBasic ? unquote(authBasic) : "";
    const literalAuthFile = authFile ? unquote(authFile) : "";
    if (
      !literalRealm
      || /^off$/i.test(literalRealm)
      || literalRealm.includes("$")
      || !literalAuthFile.startsWith("/")
      || literalAuthFile.includes("$")
      || /\s/.test(literalAuthFile)
    ) {
      failures.push(`${label} catch-all does not preserve literal staging Basic Auth`);
    }
  } else if (authBasic && !/^['"]?off['"]?$/.test(authBasic)) {
    failures.push(`${label} unexpectedly requires Basic Auth`);
  }

  for (const location of locations) {
    if (location.header === "location /") continue;
    if (locationOverlapsProtected(location.header)) failures.push(`${label} has a location that can divert a protected Fanward route: ${location.header}`);
  }
}

function targetTlsServers(value, hostname) {
  const tlsServer = /\blisten\s+(?:\[[^\]]+\]:)?443(?:\s+[^;]*)?\bssl\b[^;]*;/;
  return directiveBlocks(value, "server").filter((block) => {
    const names = block.match(/\bserver_name\s+([^;]+);/)?.[1]?.trim().split(/\s+/) ?? [];
    return names.includes(hostname) && tlsServer.test(block);
  });
}

function validateRepositoryConfig() {
  const failures = [];
  validateHttpBoundary(failures, hardening, "repository hardening config");
  const matches = targetTlsServers(vhost, "surgeindex.lol");
  if (matches.length !== 1) {
    failures.push(`repository vhost must contain exactly one canonical production TLS server; found ${matches.length}`);
  } else {
    validateTargetServer(failures, matches[0], { hostname: "surgeindex.lol", port: 3211, staging: false });
  }
  return failures;
}

function validateEffectiveConfig(value) {
  const failures = [];
  validateHttpBoundary(failures, value, "effective config");
  const targets = [
    { hostname: "surgeindex.lol", port: 3211, staging: false },
    { hostname: "staging.surgeindex.lol", port: 3212, staging: true },
  ];
  for (const target of targets) {
    const matches = targetTlsServers(value, target.hostname);
    if (matches.length !== 1) {
      failures.push(`effective config must contain exactly one canonical TLS server for ${target.hostname}; found ${matches.length}`);
      continue;
    }
    validateTargetServer(failures, matches[0], target);
  }
  return failures;
}

function validatorSelfTest() {
  const auth = (staging) => staging ? 'auth_basic "SurgeIndex staging";\n      auth_basic_user_file /etc/nginx/staging.htpasswd;' : "auth_basic off;";
  const server = (hostname, port, { staging = false, serverExtra = "", shadow = "", catchAllExtra = "" } = {}) => `server {
    listen 443 ssl;
    server_name ${hostname};
    limit_req zone=surgeindex_fanward_public burst=60 nodelay;
    limit_req_status 429;
    limit_req_dry_run off;
    ${serverExtra}
    location ^~ /api/auth/ { return 404; }
    location ~ ^/api/(sites|claims|waitlist|collect/) { return 404; }
    ${shadow}
    location / {
      ${auth(staging)}
      ${catchAllExtra}
      proxy_pass http://127.0.0.1:${port};
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For "";
    }
  }`;
  const redirect = (hostname) => `server { listen 80; server_name ${hostname}; return 301 https://${hostname}$request_uri; }`;
  const valid = `${fanwardMap}\n${fanwardZone}\n${redirect("surgeindex.lol")}\n${server("surgeindex.lol", 3211)}\n${redirect("staging.surgeindex.lol")}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (validateEffectiveConfig(valid).length !== 0) return false;

  const swapped = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3212)}\n${server("staging.surgeindex.lol", 3211, { staging: true })}`;
  if (!validateEffectiveConfig(swapped).some((failure) => failure.includes("listener 3211"))) return false;
  const duplicated = `${valid}\n${server("surgeindex.lol", 3211)}`;
  if (!validateEffectiveConfig(duplicated).some((failure) => failure.includes("exactly one canonical TLS server for surgeindex.lol"))) return false;
  const missingStaging = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211)}`;
  if (!validateEffectiveConfig(missingStaging).some((failure) => failure.includes("staging.surgeindex.lol"))) return false;

  const commentedZone = valid.replace(fanwardZone, `# ${fanwardZone}\nlimit_req_zone $surgeindex_fanward_limit_key zone=surgeindex_fanward_public:10m rate=121r/m;`);
  if (!validateEffectiveConfig(commentedZone).some((failure) => failure.includes("active Fanward limit_req_zone"))) return false;
  const commentedMap = valid.replace(fanwardMap, fanwardMap.split("\n").map((line) => `# ${line}`).join("\n"));
  if (!validateEffectiveConfig(commentedMap).some((failure) => failure.includes("active exact Fanward URI map"))) return false;
  const blanketRealIp = `http { set_real_ip_from 0.0.0.0/0; real_ip_header X-Real-IP; }\n${valid}`;
  if (!validateEffectiveConfig(blanketRealIp).some((failure) => failure.includes("real-IP trust"))) return false;
  const splitDumpRealIp = `# configuration file /etc/nginx/nginx.conf:\nhttp { include /etc/nginx/conf.d/*.conf; }\n# configuration file /etc/nginx/conf.d/real-ip.conf:\nset_real_ip_from 0.0.0.0/1;\nset_real_ip_from 128.0.0.0/1;\nreal_ip_header X-Real-IP;\n${valid}`;
  if (!validateEffectiveConfig(splitDumpRealIp).some((failure) => failure.includes("real-IP trust"))) return false;
  const bypassedAuth = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211)}\n${server("staging.surgeindex.lol", 3212, { staging: true, catchAllExtra: "satisfy any; allow 198.51.100.0/24; deny all;" })}`;
  if (!validateEffectiveConfig(bypassedAuth).some((failure) => failure.includes("satisfy any"))) return false;

  const dryRun = valid.replace("limit_req_dry_run off;", "limit_req_dry_run on;");
  if (!validateEffectiveConfig(dryRun).some((failure) => failure.includes("dry-run"))) return false;
  const exactShadow = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { shadow: "location = /sitemap.xml { return 200; }" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(exactShadow).some((failure) => failure.includes("divert a protected Fanward route"))) return false;
  const prefixShadow = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { shadow: "location ^~ /fanward/ { return 200; }" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(prefixShadow).some((failure) => failure.includes("divert a protected Fanward route"))) return false;
  const regexShadow = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { shadow: "location ~ ^/fanward { return 200; }" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(regexShadow).some((failure) => failure.includes("divert a protected Fanward route"))) return false;
  const limiterOverride = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { catchAllExtra: "limit_req zone=surgeindex_anonymous burst=20 nodelay;" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(limiterOverride).some((failure) => failure.includes("overrides the server-scope"))) return false;
  const nestedOverride = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { catchAllExtra: "location ~ ^/fanward { limit_req zone=surgeindex_anonymous burst=20 nodelay; }" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(nestedOverride).some((failure) => failure.includes("nested block"))) return false;
  const conditionalBypass = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { catchAllExtra: "if ($request_uri ~ ^/fanward/private) { return 200; }" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(conditionalBypass).some((failure) => failure.includes("nested block"))) return false;
  const serverConditionalBypass = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { serverExtra: "if ($request_uri ~ ^/fanward/private) { return 200; }" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(serverConditionalBypass).some((failure) => failure.includes("if block"))) return false;
  const includedOverride = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { catchAllExtra: "include /etc/nginx/fanward-overrides.conf;" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(includedOverride).some((failure) => failure.includes("include that can override"))) return false;
  const rewrittenRoute = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { catchAllExtra: "rewrite ^/fanward / break;" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(rewrittenRoute).some((failure) => failure.includes("rewrite that can change"))) return false;
  const internalRedirect = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { catchAllExtra: "try_files $uri @legacy;" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(internalRedirect).some((failure) => failure.includes("internal redirect"))) return false;
  const unsampledRegexShadow = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211, { shadow: "location ~ ^/fanward/private { return 200; }" })}\n${server("staging.surgeindex.lol", 3212, { staging: true })}`;
  if (!validateEffectiveConfig(unsampledRegexShadow).some((failure) => failure.includes("divert a protected Fanward route"))) return false;
  const missingAuth = `${fanwardMap}\n${fanwardZone}\n${server("surgeindex.lol", 3211)}\n${server("staging.surgeindex.lol", 3212)}`;
  if (!validateEffectiveConfig(missingAuth).some((failure) => failure.includes("staging Basic Auth"))) return false;
  const variableRealm = valid.replace('auth_basic "SurgeIndex staging";', "auth_basic $fanward_realm;");
  if (!validateEffectiveConfig(variableRealm).some((failure) => failure.includes("literal staging Basic Auth"))) return false;
  const variableAuthFile = valid.replace("auth_basic_user_file /etc/nginx/staging.htpasswd;", "auth_basic_user_file $fanward_auth_file;");
  return validateEffectiveConfig(variableAuthFile).some((failure) => failure.includes("literal staging Basic Auth"));
}

const cliArgs = process.argv.slice(2);
let effectivePath = null;
if (cliArgs.length === 0) {
  effectivePath = null;
} else if (cliArgs.length === 2 && cliArgs[0] === "--effective" && cliArgs[1]) {
  effectivePath = cliArgs[1];
} else {
  console.error("Usage: node scripts/nginx-fanward-boundary-check.mjs [--effective <nginx-T-output>]");
  process.exit(2);
}

const failures = effectivePath
  ? validateEffectiveConfig(readFileSync(resolve(effectivePath), "utf8"))
  : validateRepositoryConfig();
if (!validatorSelfTest()) failures.unshift("effective-config parser self-test failed");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL nginx-fanward-boundary: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS nginx-fanward-boundary: ${effectivePath ? "production and staging" : "repository"} URI-mapped DB-backed routes use the dedicated edge budget.`);
}
