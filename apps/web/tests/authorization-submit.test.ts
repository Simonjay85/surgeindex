import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn((location: string): never => {
    throw new Error(`REDIRECT:${location}`);
  }),
}));

vi.mock("../lib/server/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requirePageUser } from "../lib/server/authorization";

describe("page authorization boundaries", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.redirect.mockClear();
  });

  it("redirects an anonymous submit visitor to sign-up with the exact safe destination", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(requirePageUser("/submit", "sign-up")).rejects.toThrow("REDIRECT:");

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    const location = mocks.redirect.mock.calls[0]?.[0] as string;
    const redirectUrl = new URL(location, "https://surgeindex.example");
    expect(redirectUrl.pathname).toBe("/auth/sign-in");
    expect(redirectUrl.searchParams.get("mode")).toBe("sign-up");
    expect(redirectUrl.searchParams.get("next")).toBe("/submit");
  });

  it("normalizes an unsafe post-auth destination before it reaches the sign-in boundary", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(requirePageUser("https://evil.example/collect", "sign-up")).rejects.toThrow("REDIRECT:");

    const location = mocks.redirect.mock.calls[0]?.[0] as string;
    const redirectUrl = new URL(location, "https://surgeindex.example");
    expect(redirectUrl.searchParams.get("next")).toBe("/dashboard");
    expect(redirectUrl.searchParams.get("next")).not.toContain("evil.example");
  });
});
