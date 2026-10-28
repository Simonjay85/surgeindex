import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  requirePageUser: vi.fn(),
  getServerEnv: vi.fn(() => ({ TURNSTILE_SITE_KEY: "site-key" })),
}));

vi.mock("../lib/server/authorization", () => ({ requirePageUser: mocks.requirePageUser }));
vi.mock("@surge/config", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../components/submit-form", () => ({
  SubmitForm: () => <div data-testid="submit-form">submit form</div>,
}));
vi.mock("../components/password-recovery-form", () => ({
  ResendVerificationForm: () => <div data-testid="resend-verification">resend verification</div>,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => <a {...props}>{children}</a>,
}));

import SubmitPage from "../app/submit/page";

describe("submit page authorization UI boundary", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    mocks.requirePageUser.mockReset();
    mocks.getServerEnv.mockReturnValue({ TURNSTILE_SITE_KEY: "site-key" });
  });

  it("suppresses the submission form for an authenticated but unverified user", async () => {
    mocks.requirePageUser.mockResolvedValue({
      id: "unverified-user",
      name: "Unverified User",
      email: "unverified@example.com",
      emailVerified: false,
      role: "user",
      isDemo: false,
    });

    render(await SubmitPage());

    expect(screen.getByRole("heading", { name: /verify your email before submitting/i })).toBeInTheDocument();
    expect(screen.getByTestId("resend-verification")).toBeInTheDocument();
    expect(screen.queryByTestId("submit-form")).not.toBeInTheDocument();
  });

  it("renders the submission form only after the server reports a verified user", async () => {
    mocks.requirePageUser.mockResolvedValue({
      id: "verified-user",
      name: "Verified User",
      email: "verified@example.com",
      emailVerified: true,
      role: "user",
      isDemo: false,
    });

    render(await SubmitPage());

    expect(screen.getByTestId("submit-form")).toBeInTheDocument();
    expect(screen.queryByTestId("resend-verification")).not.toBeInTheDocument();
  });
});
