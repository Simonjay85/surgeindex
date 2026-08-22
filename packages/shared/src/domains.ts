/**
 * Domain normalization + validation. Used by the submission flow, the search
 * API, and the outbound redirect route — keep this strict and shared.
 */

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Extract a bare, lowercase host from arbitrary user input. */
export function normalizeDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const scheme = /^(https?):\/\//i.exec(raw);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !scheme) return null;
  const authority = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/, 1)[0] ?? "";
  if (!authority || authority.includes("@") || authority.includes("[")) return null;
  const portMatch = /:(\d+)$/.exec(authority);
  if (portMatch && portMatch[1] !== "80" && portMatch[1] !== "443") return null;
  const host = (portMatch ? authority.slice(0, -portMatch[0].length) : authority).toLowerCase().replace(/\.$/, "").replace(/^(?:www\.)+/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal" || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(":")) return null;
  return DOMAIN_RE.test(host) ? host : null;
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain);
}

/** URL-safe slug from a domain: launchpilot.ai -> launchpilot-ai */
export function domainToSlug(domain: string): string {
  return domain.replace(/\./g, "-").replace(/[^a-z0-9-]/g, "");
}

const BLOCKED_REDIRECT_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "metadata.google.internal"]);

/** True when the destination is an acceptable http(s) URL on a public host. */
export function isAllowedRedirectDestination(url: string): boolean {
  const match = /^(https?):\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url.trim());
  if (!match) return false;
  const authority = match[2] ?? "";
  if (!authority || authority.includes("@") || authority.includes("[")) return false;
  const portMatch = /:(\d+)$/.exec(authority);
  if (portMatch && portMatch[1] !== "80" && portMatch[1] !== "443") return false;
  const hostname = (portMatch ? authority.slice(0, -portMatch[0].length) : authority).toLowerCase();
  if (!hostname || BLOCKED_REDIRECT_HOSTS.has(hostname)) return false;
  if (hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.includes(":")) return false;
  if (/^(10\.|127\.|0\.|100\.(6[4-9]|[7-9]\d)\.|169\.254\.|192\.0\.0\.|192\.168\.|198\.18\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return false;
  return isValidDomain(hostname);
}

/** Build the outbound destination for a domain with a sensible default. */
export function domainToUrl(domain: string): string {
  return `https://${domain}`;
}
