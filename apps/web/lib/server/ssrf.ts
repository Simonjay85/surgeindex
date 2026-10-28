import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 6_000;
const TOTAL_TIMEOUT_MS = 15_000;

export interface PublicMetadata {
  finalUrl: string;
  title: string;
  description: string;
  html: string;
}

export class PublicFetchError extends Error {
  constructor(public readonly code: "invalid_url" | "protocol_downgrade" | "private_host" | "redirect_limit" | "timeout" | "response_too_large" | "unsupported_content_type" | "http_error" | "dns_error", message: string) {
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
  const groups = normalized.split("::");
  if (groups.length > 2) return true;
  const parseGroup = (group: string): number[] => group ? group.split(":").flatMap((part) => {
    if (part.includes(".")) {
      const octets = part.split(".").map(Number);
      if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return [Number.NaN];
      return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    }
    return /^[0-9a-f]{1,4}$/.test(part) ? [Number.parseInt(part, 16)] : [Number.NaN];
  }) : [];
  const left = parseGroup(groups[0] ?? "");
  const right = groups.length === 2 ? parseGroup(groups[1] ?? "") : [];
  if ([...left, ...right].some((part) => Number.isNaN(part))) return true;
  const full = groups.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right] : [...left];
  if (full.length !== 8) return true;
  const first = full[0];
  const second = full[1];
  const mappedIpv4 = full.slice(6).every((part) => part >= 0 && part <= 0xffff) && full.slice(0, 5).every((part) => part === 0) && full[5] === 0xffff
    ? `${full[6] >> 8}.${full[6] & 255}.${full[7] >> 8}.${full[7] & 255}`
    : null;
  if (mappedIpv4 && isBlockedIpv4(mappedIpv4)) return true;
  if (full.every((part) => part === 0) || (full.slice(0, 7).every((part) => part === 0) && full[7] === 1)) return true;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 deprecated site-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (first === 0x2001 && second === 0x0db8) return true; // documentation
  if (first === 0x2001 && (second & 0xfff0) === 0x0010) return true; // ORCHID/reserved
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

function validatePublicUrl(input: string, previous?: URL): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new PublicFetchError("invalid_url", "Only absolute URLs are accepted.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new PublicFetchError("invalid_url", "Only HTTP and HTTPS are accepted.");
  if (previous?.protocol === "https:" && url.protocol === "http:") throw new PublicFetchError("protocol_downgrade", "HTTPS redirects may not downgrade to HTTP.");
  if (url.username || url.password) throw new PublicFetchError("invalid_url", "Credentials in URLs are not accepted.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new PublicFetchError("invalid_url", "Only ports 80 and 443 are accepted.");
  return url;
}

async function readLimited(response: Response, deadline: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const remaining = Math.max(1, deadline - Date.now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PublicFetchError("timeout", "Metadata response timed out.")), remaining);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    const { done, value } = result;
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

export type DnsRecord = { address: string; family: number };
type DnsResolver = (hostname: string) => Promise<DnsRecord[]>;
export type PinnedPublicFetcher = (url: URL, record: DnsRecord, signal: AbortSignal) => Promise<Response>;

export async function fetchPublicMetadata(
  input: string,
  fetchImpl: typeof fetch = fetch,
  resolver: DnsResolver = (host) => lookup(host, { all: true }),
  pinnedFetchImpl: PinnedPublicFetcher = fetchPinned,
): Promise<PublicMetadata> {
  let current = validatePublicUrl(input);
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const records = await resolvePublicHost(current.hostname, resolver);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new PublicFetchError("timeout", "Metadata request timed out.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(FETCH_TIMEOUT_MS, remaining));
    let response: Response;
    try {
      response = fetchImpl === fetch
        ? await pinnedFetchImpl(current, records[0]!, controller.signal)
        : await fetchImpl(current, { redirect: "manual", signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml" } });
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
      current = validatePublicUrl(new URL(location, current).toString(), current);
      continue;
    }
    if (!response.ok) throw new PublicFetchError("http_error", `Metadata request returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new PublicFetchError("unsupported_content_type", "Target did not return HTML.");
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new PublicFetchError("response_too_large", "Response exceeds the metadata size limit.");
    let html: string;
    try {
      html = await readLimited(response, deadline);
    } catch (error) {
      if (error instanceof PublicFetchError) throw error;
      throw new PublicFetchError("http_error", "Metadata response could not be read.");
    }
    const metadata = parseMetadata(html);
    return { finalUrl: current.toString(), ...metadata, html };
  }
  throw new PublicFetchError("redirect_limit", "Too many redirects.");
}

/**
 * Connect to the address that was just validated. The URL hostname is kept in
 * Host/SNI so virtual-host routing and certificate validation still target the
 * user-supplied domain, while the socket cannot perform a second DNS lookup.
 */
async function fetchPinned(url: URL, record: { address: string; family: number }, signal: AbortSignal): Promise<Response> {
  const requestFactory = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = requestFactory({
      hostname: record.address,
      family: record.family,
      port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { accept: "text/html,application/xhtml+xml", host: url.host },
      ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
      timeout: FETCH_TIMEOUT_MS,
    }, (response) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) headers.set(key, value.join(", "));
        else if (value != null) headers.set(key, value);
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          response.on("data", (chunk: Buffer | string) => controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)));
          response.once("end", () => controller.close());
          response.once("error", (error) => controller.error(error));
        },
        cancel() { response.destroy(); },
      });
      resolve(new Response(body, { status: response.statusCode ?? 502, headers }));
    });
    const abort = () => request.destroy(new Error("aborted"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    request.once("timeout", () => request.destroy(new PublicFetchError("timeout", "Metadata request timed out.")));
    request.once("error", (error) => reject(error));
    request.end();
  });
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
