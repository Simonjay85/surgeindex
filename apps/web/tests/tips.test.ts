import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyTurnstile: vi.fn(async () => ({ ok: true }) as { ok: boolean; code?: string }),
  sendTransactionalEmail: vi.fn(async () => undefined),
  env: { EMAIL_PROVIDER: "http", EMAIL_HTTP_URL: "https://api.resend.com/emails", EMAIL_HTTP_API_KEY: "k", EMAIL_FROM: "SurgeIndex <no-reply@surgeindex.lol>", NEXT_PUBLIC_APP_URL: "https://surgeindex.lol", TRUSTED_PROXY_MODE: "nginx" } as Record<string, string>,
}));
vi.mock("../lib/server/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("../lib/server/email", () => ({ sendTransactionalEmail: mocks.sendTransactionalEmail }));
vi.mock("@surge/config", () => ({ getServerEnv: () => mocks.env }));

import { POST } from "../app/api/tips/route";
import { tipSchema } from "../lib/tips/schema";
import { resetTipRateLimit, tipRateLimit } from "../lib/tips/store";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "si-tips-"));
  process.env.TIPS_DATA_DIR = dir;
  resetTipRateLimit();
  mocks.verifyTurnstile.mockClear();
  mocks.sendTransactionalEmail.mockClear();
  mocks.env.EMAIL_PROVIDER = "http";
});
afterEach(async () => {
  delete process.env.TIPS_DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

const post = (body: unknown, ip = "203.0.113.7") =>
  POST(new Request("https://surgeindex.lol/api/tips", { method: "POST", headers: { "content-type": "application/json", origin: "https://surgeindex.lol", "x-real-ip": ip }, body: JSON.stringify(body) }));

const valid = { topic: "Diễn biến mới của một vụ việc", sourceUrl: "https://vnexpress.net/a.html", note: "Ghi chú ngắn", email: "Ban@Vidu.vn", turnstileToken: "tok" };

describe("tip schema", () => {
  it("requires topic and a URL, caps the note at 1000 chars and validates optional email", () => {
    expect(tipSchema.safeParse(valid).success).toBe(true);
    expect(tipSchema.safeParse({ ...valid, topic: "" }).success).toBe(false);
    expect(tipSchema.safeParse({ ...valid, sourceUrl: "khong-phai-link" }).success).toBe(false);
    expect(tipSchema.safeParse({ ...valid, sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(tipSchema.safeParse({ ...valid, note: "a".repeat(1001) }).success).toBe(false);
    expect(tipSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(tipSchema.safeParse({ ...valid, email: "", note: "" }).success).toBe(true);
    expect(tipSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });

  it("rate limits per subject", () => {
    for (let i = 0; i < 5; i++) expect(tipRateLimit("1.2.3.4").allowed).toBe(true);
    expect(tipRateLimit("1.2.3.4").allowed).toBe(false);
    expect(tipRateLimit("5.6.7.8").allowed).toBe(true);
  });
});

describe("POST /api/tips", () => {
  it("verifies Turnstile, stores the tip as JSONL (no raw IP) and emails the editor", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith(expect.any(Request), "tok", "tip");
    const lines = (await readFile(path.join(dir, "tips.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const tip = JSON.parse(lines[0]!);
    expect(tip).toMatchObject({ topic: valid.topic, source_url: valid.sourceUrl, email: "ban@vidu.vn", status: "new" });
    expect(tip.received_at).toMatch(/\+07:00$/);
    expect(JSON.stringify(tip)).not.toContain("203.0.113.7");
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "simonjay0805@gmail.com" }));
  });

  it("skips email silently when Resend is not configured", async () => {
    mocks.env.EMAIL_PROVIDER = "disabled";
    expect((await post(valid)).status).toBe(201);
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects a failed Turnstile check and invalid input without storing", async () => {
    mocks.verifyTurnstile.mockResolvedValueOnce({ ok: false, code: "turnstile_failed" });
    expect((await post(valid)).status).toBe(422);
    expect((await post({ ...valid, sourceUrl: "x" })).status).toBe(422);
    await expect(readFile(path.join(dir, "tips.jsonl"), "utf8")).rejects.toThrow();
  });

  it("returns 429 after 5 tips per hour from one IP", async () => {
    for (let i = 0; i < 5; i++) expect((await post(valid, "198.51.100.1")).status).toBe(201);
    const res = await post(valid, "198.51.100.1");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("drops honeypot submissions silently", async () => {
    expect((await post({ ...valid, website: "spam.example" })).status).toBe(201);
    await expect(readFile(path.join(dir, "tips.jsonl"), "utf8")).rejects.toThrow();
  });
});
