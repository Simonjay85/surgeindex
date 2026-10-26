import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/server/public-provider", () => ({ getPublicDataProvider: () => ({ getSiteById: async () => null, source: "test" }) }));
vi.mock("../lib/server/realtime", () => ({ getRealtimeSnapshot: async () => ({}) }));
vi.mock("@surge/config", () => ({ getServerEnv: () => ({ REALTIME_PROVIDER: "none" }) }));

import { GET, POST } from "../app/api/live/[siteId]/route";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "si-live-api-"));
  process.env.LIVE_DATA_DIR = dir;
});
afterEach(async () => {
  delete process.env.LIVE_DATA_DIR;
  delete process.env.LIVE_ADMIN_TOKEN;
  await rm(dir, { recursive: true, force: true });
});

const params = (siteId: string) => ({ params: Promise.resolve({ siteId }) });
const post = (slug: string, body: unknown, token?: string) =>
  POST(new Request(`https://surgeindex.lol/api/live/${slug}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }), params(slug));

describe("/api/live/<slug>", () => {
  it("is disabled (503) without LIVE_ADMIN_TOKEN", async () => {
    expect((await post("truong-giang", { text: "x", sources: ["https://a.vn/x"] }, "t")).status).toBe(503);
  });

  it("rejects bad tokens, unknown slugs and updates without sources", async () => {
    process.env.LIVE_ADMIN_TOKEN = "s3cret";
    expect((await post("truong-giang", { text: "x", sources: ["https://a.vn/x"] }, "wrong")).status).toBe(401);
    expect((await post("khong-co", { text: "x", sources: ["https://a.vn/x"] }, "s3cret")).status).toBe(404);
    expect((await post("truong-giang", { text: "x", sources: [] }, "s3cret")).status).toBe(422);
  });

  it("appends an update (action defaults to update) and serves it from GET", async () => {
    process.env.LIVE_ADMIN_TOKEN = "s3cret";
    const res = await post("truong-giang", { text: "Cập nhật có nguồn", sources: ["https://vnexpress.net/a.html"], time: "2026-10-27T09:30:00+07:00" }, "s3cret");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entry).toMatchObject({ text: "Cập nhật có nguồn", time: "2026-10-27T09:30:00+07:00" });
    const got = await (await GET(new Request("https://surgeindex.lol/api/live/truong-giang"), params("truong-giang"))).json();
    expect(got).toMatchObject({ slug: "truong-giang", live: true });
    expect(got.updates[0].text).toBe("Cập nhật có nguồn");
    const resolved = await post("truong-giang", { action: "resolve", summary: "Diễn biến cuối", sources: ["https://dantri.com.vn/x.htm"] }, "s3cret");
    expect(resolved.status).toBe(201);
    expect((await post("truong-giang", { action: "resolve", summary: "Lại", sources: ["https://a.vn/x"] }, "s3cret")).status).toBe(409);
  });

  it("keeps the legacy site-id behaviour for non-story ids", async () => {
    expect((await GET(new Request("https://surgeindex.lol/api/live/nope"), params("nope"))).status).toBe(404);
  });
});
