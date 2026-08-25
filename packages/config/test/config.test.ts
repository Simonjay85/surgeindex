import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getServerEnv, resetServerEnvCache } from "../src/index";

const original = { ...process.env };

function setMode(mode?: string, provider?: string) {
  process.env.NODE_ENV = "test";
  if (mode === undefined) delete process.env.APP_MODE;
  else process.env.APP_MODE = mode;
  if (provider === undefined) delete process.env.DATA_PROVIDER;
  else process.env.DATA_PROVIDER = provider;
  delete process.env.DATABASE_URL;
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.TRUSTED_PROXY_MODE;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_HTTP_URL;
  delete process.env.EMAIL_HTTP_API_KEY;
  delete process.env.TURNSTILE_REQUIRED;
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
  delete process.env.NEXT_PUBLIC_COMMERCIAL_ENABLED;
  resetServerEnvCache();
}

function setProductionDependencies() {
  process.env.NEXT_PUBLIC_APP_URL = "https://surgeindex.example";
  process.env.TRUSTED_PROXY_MODE = "direct_nginx";
  process.env.EMAIL_PROVIDER = "http";
  process.env.EMAIL_FROM = "no-reply@surgeindex.example";
  process.env.EMAIL_HTTP_URL = "https://mail.example.test/send";
  process.env.EMAIL_HTTP_API_KEY = "test-only-email-key";
  process.env.TURNSTILE_REQUIRED = "true";
  process.env.TURNSTILE_SITE_KEY = "0xsite";
  process.env.TURNSTILE_SECRET_KEY = "0xsecret";
  process.env.TURNSTILE_EXPECTED_HOSTNAME = "surgeindex.example";
}

describe("explicit application configuration", () => {
  beforeEach(() => setMode("demo", "demo"));
  afterEach(() => {
    process.env = { ...original };
    resetServerEnvCache();
  });

  it("does not infer a mode or provider from legacy variables", () => {
    delete process.env.APP_MODE;
    delete process.env.DATA_PROVIDER;
    process.env.DEMO_MODE = "true";
    resetServerEnvCache();
    expect(() => getServerEnv()).toThrow(/APP_MODE/);
  });

  it("requires postgres and a secret in production", () => {
    setMode("production", "demo");
    expect(() => getServerEnv()).toThrow(/DATA_PROVIDER/);
    setMode("production", "postgres");
    setProductionDependencies();
    process.env.DATABASE_URL = "postgresql://example";
    expect(() => getServerEnv()).toThrow(/BETTER_AUTH_SECRET/);
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    expect(getServerEnv().APP_MODE).toBe("production");
  });

  it("fails closed when production Turnstile is not explicitly enabled", () => {
    setMode("production", "postgres");
    setProductionDependencies();
    process.env.DATABASE_URL = "postgresql://example";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    delete process.env.TURNSTILE_REQUIRED;
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
    expect(() => getServerEnv()).toThrow(/TURNSTILE_REQUIRED/);
  });

  it("does not permit fixture GA4 or missing token keys in production", () => {
    setMode("production", "postgres");
    setProductionDependencies();
    process.env.DATABASE_URL = "postgresql://example";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    process.env.GA4_ENABLED = "true";
    process.env.GA4_PROVIDER_MODE = "fixture";
    expect(() => getServerEnv()).toThrow(/GA4_PROVIDER_MODE/);

    process.env.GA4_PROVIDER_MODE = "google";
    expect(() => getServerEnv()).toThrow(/GA4_OAUTH_CLIENT_ID|GA4_TOKEN_ENCRYPTION_KEY/);
  });

  it("keeps Stripe test/live configuration isolated and server-required", () => {
    setMode("demo", "demo");
    process.env.STRIPE_SECRET_KEY = "sk_live_never-in-demo";
    expect(() => getServerEnv()).toThrow(/demo mode cannot use a live Stripe secret/);

    setMode("production", "postgres");
    setProductionDependencies();
    process.env.DATABASE_URL = "postgresql://example";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    expect(() => getServerEnv()).toThrow(/STRIPE_WEBHOOK_SECRET|STRIPE_CHECKOUT_SUCCESS_URL/);

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture";
    process.env.STRIPE_CHECKOUT_SUCCESS_URL = "https://example.test/boost/success";
    process.env.STRIPE_CHECKOUT_CANCEL_URL = "https://example.test/boost/cancel";
    expect(getServerEnv().STRIPE_TEST_MODE_REQUIRED).toBe(true);
  });

  it("keeps public commercial UI fail-closed until both Boost and Stripe are enabled", () => {
    setMode("production", "postgres");
    setProductionDependencies();
    process.env.DATABASE_URL = "postgresql://example";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    process.env.NEXT_PUBLIC_COMMERCIAL_ENABLED = "true";
    expect(() => getServerEnv()).toThrow(/NEXT_PUBLIC_COMMERCIAL_ENABLED/);

    process.env.BOOST_ENABLED = "true";
    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture";
    process.env.STRIPE_CHECKOUT_SUCCESS_URL = "https://example.test/boost/success";
    process.env.STRIPE_CHECKOUT_CANCEL_URL = "https://example.test/boost/cancel";
    expect(getServerEnv().NEXT_PUBLIC_COMMERCIAL_ENABLED).toBe(true);
  });

  it("requires secure production callback and challenge configuration", () => {
    setMode("production", "postgres");
    setProductionDependencies();
    process.env.DATABASE_URL = "postgresql://example";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);

    process.env.NEXT_PUBLIC_APP_URL = "http://surgeindex.example";
    expect(() => getServerEnv()).toThrow(/NEXT_PUBLIC_APP_URL/);

    process.env.NEXT_PUBLIC_APP_URL = "https://surgeindex.example";
    process.env.TURNSTILE_REQUIRED = "true";
    process.env.TURNSTILE_SITE_KEY = "0xsite";
    process.env.TURNSTILE_SECRET_KEY = "0xsecret";
    delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
    expect(() => getServerEnv()).toThrow(/TURNSTILE_EXPECTED_HOSTNAME/);

    process.env.TURNSTILE_EXPECTED_HOSTNAME = "surgeindex.example";
    process.env.EMAIL_HTTP_URL = "http://mail.example.test/send";
    expect(() => getServerEnv()).toThrow(/EMAIL_HTTP_URL/);
  });
});
