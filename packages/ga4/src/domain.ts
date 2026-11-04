import { domainToASCII } from "node:url";
import type { DomainMatchState } from "./types";

export interface NormalizedHost {
  host: string;
  baseHost: string;
}

export function normalizeHost(input: string): NormalizedHost | null {
  const raw = input.trim();
  if (!raw) return null;
  let hostname = raw;
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    hostname = url.hostname;
  } catch {
    return null;
  }
  const ascii = domainToASCII(hostname.toLowerCase().replace(/\.$/, ""));
  if (!ascii || ascii.length > 253 || ascii.includes(":")) return null;
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(ascii)) return null;
  return { host: ascii, baseHost: ascii.replace(/^www\./, "") };
}

export function domainMatchState(
  siteDomain: string,
  streamUri: string | null,
  options: { approvedAliases?: string[]; approvedSubdomains?: string[] } = {},
): { state: DomainMatchState; siteHost: string; streamHost: string | null; reason: string } {
  const site = normalizeHost(siteDomain);
  const stream = streamUri ? normalizeHost(streamUri) : null;
  if (!site || !stream) return { state: "unknown", siteHost: site?.baseHost ?? siteDomain, streamHost: stream?.host ?? null, reason: "The site or stream URI could not be normalized." };
  if (site.host === stream.host) return { state: "exact", siteHost: site.baseHost, streamHost: stream.host, reason: "The stream host exactly matches the canonical site host." };
  if (site.baseHost === stream.baseHost) return { state: "www_equivalent", siteHost: site.baseHost, streamHost: stream.host, reason: "The stream differs only by the approved www equivalent." };
  const aliases = (options.approvedAliases ?? []).map(normalizeHost).filter((value): value is NormalizedHost => Boolean(value)).map((value) => value.host);
  if (aliases.includes(stream.host)) return { state: "approved_alias", siteHost: site.baseHost, streamHost: stream.host, reason: "The stream host matches an explicitly approved site alias." };
  const subdomains = (options.approvedSubdomains ?? []).map(normalizeHost).filter((value): value is NormalizedHost => Boolean(value)).map((value) => value.host);
  if (subdomains.includes(stream.host) || (stream.host.endsWith(`.${site.baseHost}`) && subdomains.includes(stream.host))) {
    return { state: "approved_subdomain", siteHost: site.baseHost, streamHost: stream.host, reason: "The stream host matches an explicitly approved subdomain." };
  }
  return { state: "mismatch", siteHost: site.baseHost, streamHost: stream.host, reason: "The stream host does not match the canonical site domain." };
}

export function isAcceptedDomainMatch(state: DomainMatchState): boolean {
  return ["exact", "www_equivalent", "approved_subdomain", "approved_alias"].includes(state);
}
