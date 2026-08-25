import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractMetaVerificationToken, fetchPublicMetadata, resolvePublicHost } from "../lib/server/ssrf";

function response(body: string, headers: Record<string, string> = {}, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

describe("public metadata fetch safety", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("blocks a hostname that resolves to a private address", async () => {
    await expect(resolvePublicHost("example.test", async () => [{ address: "192.168.1.20", family: 4 }])).rejects.toMatchObject({ code: "private_host" });
  });

  it("rejects a mixed public/private DNS answer instead of selecting the first record", async () => {
    await expect(resolvePublicHost("mixed.example", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ])).rejects.toMatchObject({ code: "private_host" });
  });

  it.each([
    ["::1", 6],
    ["fc00::1", 6],
    ["fe80::1", 6],
    ["ff02::1", 6],
    ["::ffff:192.168.1.1", 6],
  ])("blocks reserved IPv6 address %s", async (address, family) => {
    await expect(resolvePublicHost("ipv6.example", async () => [{ address, family }])).rejects.toMatchObject({ code: "private_host" });
  });

  it("re-resolves redirects and refuses a private redirect target", async () => {
    const resolver = vi.fn(async (hostname: string) => hostname === "public.example" ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => input.toString().includes("public.example") ? response("", { location: "https://private.example" }, 302) : response("<title>should not be read</title>"));
    await expect(fetchPublicMetadata("https://public.example", fetchImpl, resolver)).rejects.toMatchObject({ code: "private_host" });
    expect(resolver).toHaveBeenCalledWith("private.example");
  });

  it("does not allow an HTTPS response to redirect down to HTTP", async () => {
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    const fetchImpl = vi.fn(async () => response("", { location: "http://public.example" }, 302));
    await expect(fetchPublicMetadata("https://public.example", fetchImpl, resolver)).rejects.toMatchObject({ code: "protocol_downgrade" });
  });

  it("connects using the address validated in the same DNS resolution", async () => {
    let calls = 0;
    const resolver = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }];
    });
    const pinnedFetch = vi.fn(async (_url, record) => {
      expect(record.address).toBe("93.184.216.34");
      return response("<title>pinned</title>");
    });
    const result = await fetchPublicMetadata("https://public.example", fetch, resolver, pinnedFetch);
    expect(result.title).toBe("pinned");
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(pinnedFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects non-HTML and declared oversized responses", async () => {
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    await expect(fetchPublicMetadata("https://public.example", vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } })), resolver)).rejects.toMatchObject({ code: "unsupported_content_type" });
    await expect(fetchPublicMetadata("https://public.example", vi.fn(async () => response("", { "content-length": "300000" })), resolver)).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("times out a response that stalls while streaming", async () => {
    vi.useFakeTimers();
    try {
      const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
      const body = new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => undefined);
        },
      });
      const pending = fetchPublicMetadata(
        "https://public.example",
        vi.fn(async () => new Response(body, { headers: { "content-type": "text/html" } })),
        resolver,
      );
      const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(15_100);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("imports bounded metadata and extracts the ownership token", async () => {
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    const html = '<html><head><title>Example site</title><meta name="description" content="A useful site" /><meta name="surgeindex-verification" content="abc123" /></head></html>';
    const result = await fetchPublicMetadata("https://public.example", vi.fn(async () => response(html)), resolver);
    expect(result.title).toBe("Example site");
    expect(result.description).toBe("A useful site");
    expect(extractMetaVerificationToken(result.html)).toBe("abc123");
  });
});
