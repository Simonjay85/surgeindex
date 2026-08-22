import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 6_000;

export interface PublicMetadata {
  finalUrl: string;
  title: string;
  description: string;
  html: string;
}

export class PublicFetchError extends Error {
  constructor(public readonly code: "invalid_url" | "private_host" | "redirect_limit" | "timeout" | "response_too_large" | "unsupported_content_type" | "http_error" | "dns_error", message: string) {
    super(message);
    this.name = "PublicFetchError";
  }
}

function ipv4ToNumber(value: string): number | null {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function isBlockedIpv4(value: string): boolean {
  const number = ipv4ToNumber(value);
  if (number == null) return true;
  const ranges: Array<[number, number]> = [
    [0x00000000, 0x00ffffff], // 0.0.0.0/8
    [0x0a000000, 0x0affffff], // 10/8
    [0x64400000, 0x647fffff], // 100.64/10
    [0x7f000000, 0x7fffffff], // 127/8
    [0xa9fe0000, 0xa9feffff], // 169.254/16
    [0xac100000, 0xac1fffff], // 172.16/12
    [0xc0000000, 0xc00000ff], // 192.0.0/24
    [0xc0a80000, 0xc0a8ffff], // 192.168/16
    [0xc0000200, 0xc00002ff], // 192.0.2/24 documentation
    [0xc6336400, 0xc63364ff], // 198.51.100/24 documentation
    [0xcb007100, 0xcb0071ff], // 203.0.113/24 documentation
    [0xc6120000, 0xc613ffff], // 198.18/15
    [0xe0000000, 0xffffffff], // multicast/reserved
  ];
  return ranges.some(([start, end]) => number >= start && number <= end);
}

function isBlockedIpv6(value: string): boolean {
  const normalized = value.toLowerCase().split("%", 1)[0];
  const mappedIpv4 = /^::ffff:(\d+(?:\.\d+){3})$/.exec(normalized)?.[1];
  if (mappedIpv4 && isBlockedIpv4(mappedIpv4)) return true;
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8:")) return true;
  return false;
}

export async function resolvePublicHost(hostname: string, resolver: (hostname: string) => Promise<Array<{ address: string; family: number }>> = (host) => lookup(host, { all: true })) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") throw new PublicFetchError("private_host", "Host is not public.");
  const directFamily = isIP(host);
  if (directFamily === 4 && isBlockedIpv4(host)) throw new PublicFetchError("private_host", "IPv4 address is private or reserved.");
  if (directFamily === 6 && isBlockedIpv6(host)) throw new PublicFetchError("private_host", "IPv6 address is private or reserved.");
  if (directFamily) return [{ address: host, family: directFamily }];
  let records: Array<{ address: string; family: number }>;
  try {
    records = await resolver(host);
  } catch {
    throw new PublicFetchError("dns_error", "Host could not be resolved.");
  }
  if (!records.length) throw new PublicFetchError("dns_error", "Host has no address records.");
  for (const record of records) {
    if (record.family === 4 && isBlockedIpv4(record.address)) throw new PublicFetchError("private_host", "Host resolves to a private or reserved IPv4 address.");
    if (record.family === 6 && isBlockedIpv6(record.address)) throw new PublicFetchError("private_host", "Host resolves to a private or reserved IPv6 address.");
  }
  return records;
}

function validatePublicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new PublicFetchError("invalid_url", "Only absolute URLs are accepted.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new PublicFetchError("invalid_url", "Only HTTP and HTTPS are accepted.");
  if (url.username || url.password) throw new PublicFetchError("invalid_url", "Credentials in URLs are not accepted.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new PublicFetchError("invalid_url", "Only ports 80 and 443 are accepted.");
  return url;
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PublicFetchError("response_too_large", "Response exceeds the metadata size limit.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(result);
}

function cleanText(value: string | undefined, max: number): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseMetadata(html: string): { title: string; description: string } {
  const title = cleanText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1], 160);
  const descriptionMatch = /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i.exec(html)
    ?? /<meta[^>]+content=["']([\s\S]*?)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i.exec(html);
  return { title: title || "Untitled website", description: cleanText(descriptionMatch?.[1], 320) };
}

type DnsResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export async function fetchPublicMetadata(input: string, fetchImpl: typeof fetch = fetch, resolver: DnsResolver = (host) => lookup(host, { all: true })): Promise<PublicMetadata> {
  let current = validatePublicUrl(input);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await resolvePublicHost(current.hostname, resolver);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(current, { redirect: "manual", signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml" } });
    } catch (error) {
      if (error instanceof PublicFetchError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new PublicFetchError("timeout", "Metadata request timed out.");
      throw new PublicFetchError("http_error", "Metadata request failed.");
    } finally {
      clearTimeout(timeout);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new PublicFetchError("http_error", "Redirect did not include a destination.");
      if (redirectCount === MAX_REDIRECTS) throw new PublicFetchError("redirect_limit", "Too many redirects.");
      current = validatePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new PublicFetchError("http_error", `Metadata request returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new PublicFetchError("unsupported_content_type", "Target did not return HTML.");
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new PublicFetchError("response_too_large", "Response exceeds the metadata size limit.");
    const html = await readLimited(response);
    const metadata = parseMetadata(html);
    return { finalUrl: current.toString(), ...metadata, html };
  }
  throw new PublicFetchError("redirect_limit", "Too many redirects.");
}

export function extractMetaVerificationToken(html: string): string | null {
  const tag = /<meta\b[^>]*>/gi;
  for (const match of html.matchAll(tag)) {
    const value = match[0];
    const name = /\bname=["']([^"']+)["']/i.exec(value)?.[1]?.toLowerCase();
    if (name !== "surgeindex-verification") continue;
    return /\bcontent=["']([^"']+)["']/i.exec(value)?.[1] ?? null;
  }
  return null;
}
