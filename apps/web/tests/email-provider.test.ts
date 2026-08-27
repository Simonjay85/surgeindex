import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("@surge/config", () => ({
  getServerEnv: () => ({
    EMAIL_PROVIDER: "http",
    EMAIL_HTTP_URL: "https://api.resend.com/emails",
    EMAIL_HTTP_API_KEY: "test-only-key",
    EMAIL_FROM: "SurgeIndex <no-reply@surgeindex.lol>",
    EMAIL_REPLY_TO: "support@surgeindex.lol",
    EMAIL_HTTP_TIMEOUT_MS: 8_000,
  }),
}));

describe("transactional email provider contract", () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("uses Resend's reply_to field and keeps credentials in the Authorization header", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendTransactionalEmail } = await import("../lib/server/email");

    await sendTransactionalEmail({
      to: "mailbox@example.test",
      subject: "Verify your SurgeIndex email",
      text: "Verification message",
      html: "<p>Verification message</p>",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ authorization: "Bearer test-only-key" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: "SurgeIndex <no-reply@surgeindex.lol>",
      reply_to: "support@surgeindex.lol",
      to: "mailbox@example.test",
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("replyTo");
  });
});
