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
  resetServerEnvCache();
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
    process.env.DATABASE_URL = "postgresql://example";
    expect(() => getServerEnv()).toThrow(/BETTER_AUTH_SECRET/);
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    expect(getServerEnv().APP_MODE).toBe("production");
  });

  it("does not permit fixture GA4 or missing token keys in production", () => {
    setMode("production", "postgres");
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
});
