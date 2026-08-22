/**
 * Domain normalization + validation. Used by the submission flow, the search
 * API, and the outbound redirect route — keep this strict and shared.
 */

const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Extract a bare, lowercase host from arbitrary user input. */
export function normalizeDomain(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  // Strip scheme, path, query, hash, credentials, port.
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  raw = raw.split("/")[0] ?? "";
  raw = raw.split("?")[0] ?? "";
  raw = raw.split("#")[0] ?? "";
  raw = raw.split("@").pop() ?? "";
  raw = raw.split(":")[0] ?? "";
  raw = raw.replace(/[^a-z0-9.-]/g, "");
  if (!raw) return null;
  if (raw === "localhost" || DOMAIN_RE.test(raw)) return raw;
  return null;
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain);
}

/** URL-safe slug from a domain: launchpilot.ai -> launchpilot-ai */
export function domainToSlug(domain: string): string {
  return domain.replace(/\./g, "-").replace(/[^a-z0-9-]/g, "");
}

const BLOCKED_REDIRECT_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

/** True when the destination is an acceptable http(s) URL on a public host. */
export function isAllowedRedirectDestination(url: string): boolean {
  const match = /^(https?):\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url.trim());
  if (!match) return false;
  const authority = match[2] ?? "";
  if (!authority || authority.includes("@")) return false;
  const hostname = authority.replace(/:\d+$/, "").toLowerCase();
  if (!hostname || BLOCKED_REDIRECT_HOSTS.has(hostname)) return false;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return false;
  return match[1] === "http" || match[1] === "https";
}

/** Build the outbound destination for a domain with a sensible default. */
export function domainToUrl(domain: string): string {
  return `https://${domain}`;
}
