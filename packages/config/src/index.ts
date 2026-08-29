import { z } from "zod";

const emailAddressSchema = z.string().email();
const emailFromSchema = z.string().refine((value) => {
  if (emailAddressSchema.safeParse(value).success) return true;
  const match = value.match(/^.+<([^<>]+)>$/);
  return Boolean(match && emailAddressSchema.safeParse(match[1].trim()).success);
}, "Invalid email address");

/**
 * Server-side environment schema. Demo mode is deliberately explicit. A
 * production process may never silently select the deterministic provider.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["demo", "production"]),
  DATA_PROVIDER: z.enum(["demo", "postgres"]),
  ANALYTICS_PROVIDER: z.enum(["postgres", "tinybird"]).default("postgres"),
  REALTIME_PROVIDER: z.enum(["local", "durable_objects"]).default("local"),
  REALTIME_SERVICE_URL: z.string().url().optional(),
  QUEUE_PROVIDER: z.enum(["local", "cloudflare"]).default("local"),
  TRACKER_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  GA4_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  GA4_PROVIDER_MODE: z.enum(["google", "fixture", "mock"]).default("fixture"),
  GA4_OAUTH_CLIENT_ID: z.string().optional(),
  GA4_OAUTH_CLIENT_SECRET: z.string().optional(),
  GA4_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GA4_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  GA4_TOKEN_ENCRYPTION_KEY_VERSION: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/).default("v1"),
  GA4_TOKEN_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),
  GA4_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/).optional(),
  GA4_ADMIN_API_BASE_URL: z.string().url().default("https://analyticsadmin.googleapis.com/v1beta"),
  GA4_DATA_API_BASE_URL: z.string().url().default("https://analyticsdata.googleapis.com/v1beta"),
  GA4_INITIAL_BACKFILL_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  GA4_CORE_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  GA4_REALTIME_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(2).max(60).default(5),
  GA4_MAX_PROPERTIES_PER_USER: z.coerce.number().int().min(1).max(1000).default(100),
  GA4_MAX_PARALLEL_REQUESTS: z.coerce.number().int().min(1).max(20).default(4),
  GA4_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
  GA4_SOURCE_SWITCH_LOCK_DAYS: z.coerce.number().int().min(0).max(365).default(14),
  GA4_SOURCE_OVERLAP_REVIEW_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  GA4_STALE_AFTER_MINUTES: z.coerce.number().int().min(5).max(10080).default(180),
  GA4_OFFLINE_AFTER_HOURS: z.coerce.number().int().min(1).max(720).default(48),
  BOOST_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  BOOST_LIVE_MODE_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  BOOST_DEFAULT_CURRENCY: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  BOOST_INVENTORY_TIME_ZONE: z.string().min(1).max(64).default("UTC"),
  BOOST_RESERVATION_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  BOOST_DEFAULT_CAMPAIGN_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  BOOST_MAX_CAMPAIGN_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  BOOST_MAX_FREQUENCY_PER_VISITOR_PER_DAY: z.coerce.number().int().min(1).max(100).default(3),
  BOOST_IMPRESSION_VISIBILITY_PERCENT: z.coerce.number().int().min(1).max(100).default(50),
  BOOST_IMPRESSION_VISIBILITY_MS: z.coerce.number().int().min(100).max(10_000).default(1_000),
  BOOST_ATTRIBUTION_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  BOOST_MAX_OVERDELIVERY_PERCENT: z.coerce.number().int().min(0).max(100).default(10),
  BOOST_UNDERDELIVERY_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(2),
  NEXT_PUBLIC_APP_NAME: z.string().default("SurgeIndex"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_COMMERCIAL_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  NEXT_PUBLIC_RADAR_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  DB_DRIVER: z.enum(["pg", "neon"]).default("pg"),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  GOOGLE_AUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_AUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ANALYTICS_CLIENT_ID: z.string().optional(),
  GOOGLE_ANALYTICS_CLIENT_SECRET: z.string().optional(),
  OAUTH_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  TINYBIRD_API_URL: z.string().optional(),
  TINYBIRD_INGEST_TOKEN: z.string().optional(),
  TINYBIRD_READ_TOKEN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_API_VERSION: z.string().min(1).max(32).default("2025-06-30.basil"),
  STRIPE_CHECKOUT_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CHECKOUT_CANCEL_URL: z.string().url().optional(),
  STRIPE_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  STRIPE_TEST_MODE_REQUIRED: z
    .preprocess((value) => value === undefined || value === true || value === "true" || value === "1", z.boolean())
    .default(true),
  STRIPE_TAX_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  BOOST_STARTER_PRICE_ID: z.string().optional(),
  BOOST_GROWTH_PRICE_ID: z.string().optional(),
  BOOST_LAUNCH_PRICE_ID: z.string().optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_RADAR_API_TOKEN: z.string().optional(),
  CLOUDFLARE_RADAR_API_BASE_URL: z.string().url().default("https://api.cloudflare.com/client/v4/radar"),
  CLOUDFLARE_RADAR_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(8_000),
  CLOUDFLARE_RADAR_CACHE_SECONDS: z.coerce.number().int().min(60).max(3_600).default(300),
  CLOUDFLARE_QUEUE_NAME: z.string().default("surgeindex-events"),
  CLOUDFLARE_DLQ_NAME: z.string().default("surgeindex-events-dlq"),
  INTERNAL_INGEST_URL: z.string().optional(),
  INTERNAL_SERVICE_TOKEN: z.string().optional(),
  TRACKER_PUBLIC_URL: z.string().default("/tracker.js"),
  TRACKER_COLLECTOR_URL: z.string().default("/api/collect/v1/events"),
  TRACKER_HASH_SECRET: z.string().optional(),
  TRACKER_HASH_SALT: z.string().optional(),
  TRACKER_SIGNING_SECRET: z.string().optional(),
  TRACKER_KEY_ROTATION_SECRET: z.string().optional(),
  HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(300).default(30),
  ACTIVE_SESSION_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(90),
  ENGAGED_SESSION_SECONDS: z.coerce.number().int().min(1).max(3600).default(10),
  ATTRIBUTION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  TRACKER_EVENT_MAX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  TRACKER_EVENT_MAX_BODY_BYTES: z.coerce.number().int().min(4096).max(1_048_576).default(64 * 1024),
  EVENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(730).default(90),
  SCORE_VERSION: z.string().default("v1"),
  EXPECTED_MIGRATION_COUNT: z.coerce.number().int().min(1).max(10_000).default(14),
  TRUSTED_PROXY_MODE: z.enum(["none", "direct_nginx", "cloudflare_nginx"]).default("none"),
  TURNSTILE_REQUIRED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  TURNSTILE_EXPECTED_HOSTNAME: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["disabled", "console", "http"]).default("disabled"),
  EMAIL_FROM: emailFromSchema.optional(),
  EMAIL_REPLY_TO: z.string().email().optional(),
  EMAIL_HTTP_URL: z.string().url().optional(),
  EMAIL_HTTP_API_KEY: z.string().optional(),
  EMAIL_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(8000),
  BOOST_PLACEMENT_HOMEPAGE_ENABLED: z
    .preprocess((value) => value === undefined || value === true || value === "true" || value === "1", z.boolean())
    .default(true),
  BOOST_PLACEMENT_CATEGORY_ENABLED: z
    .preprocess((value) => value === undefined || value === true || value === "true" || value === "1", z.boolean())
    .default(true),
  BOOST_PLACEMENT_RANKING_ENABLED: z
    .preprocess((value) => value === undefined || value === true || value === "true" || value === "1", z.boolean())
    .default(true),
  BOOST_PLACEMENT_PROFILE_ENABLED: z
    .preprocess((value) => value === undefined || value === true || value === "true" || value === "1", z.boolean())
    .default(true),
  BOOST_PLACEMENT_BREAKOUT_ENABLED: z
    .preprocess((value) => value === undefined || value === true || value === "true" || value === "1", z.boolean())
    .default(true),
  PUBLIC_REVENUE_BOARD_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  PUBLIC_PAGE_METRICS_ENABLED: z
    .preprocess((value) => value === true || value === "true" || value === "1", z.boolean())
    .default(false),
  FEATURE_CREATORS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  FEATURE_CAMPAIGNS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  FEATURE_AUCTION: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  FEATURE_PUBLIC_API: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/** Parse (and cache) the server environment. Throws a readable error when a
 * mandatory variable is missing. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to apps/web/.env and fill in the required values.`);
  }
  const values = parsed.data;
  const configurationIssues: string[] = [];
  if (values.DATA_PROVIDER === "postgres" && !values.DATABASE_URL) {
    configurationIssues.push("  - DATABASE_URL: required when DATA_PROVIDER=postgres");
  }
  if (values.APP_MODE === "production" && values.DATA_PROVIDER !== "postgres") {
    configurationIssues.push("  - DATA_PROVIDER: production mode requires DATA_PROVIDER=postgres");
  }
  if (values.APP_MODE === "production" && (!values.BETTER_AUTH_SECRET || values.BETTER_AUTH_SECRET.length < 32)) {
    configurationIssues.push("  - BETTER_AUTH_SECRET: production requires at least 32 characters");
  }
  if (values.APP_MODE === "production" && new URL(values.NEXT_PUBLIC_APP_URL).protocol !== "https:") {
    configurationIssues.push("  - NEXT_PUBLIC_APP_URL: production requires an HTTPS origin");
  }
  if (values.APP_MODE === "production" && values.TRUSTED_PROXY_MODE === "none") {
    configurationIssues.push("  - TRUSTED_PROXY_MODE: production must explicitly select direct_nginx or cloudflare_nginx");
  }
  if (values.APP_MODE === "production" && !values.TURNSTILE_REQUIRED) {
    configurationIssues.push("  - TURNSTILE_REQUIRED: production anonymous mutations require TURNSTILE_REQUIRED=true");
  }
  if (values.APP_MODE === "production" && values.TURNSTILE_REQUIRED && (!values.TURNSTILE_SITE_KEY || !values.TURNSTILE_SECRET_KEY)) {
    configurationIssues.push("  - TURNSTILE_SITE_KEY/TURNSTILE_SECRET_KEY: required when TURNSTILE_REQUIRED=true");
  }
  if (values.APP_MODE === "production" && values.TURNSTILE_REQUIRED && !values.TURNSTILE_EXPECTED_HOSTNAME) {
    configurationIssues.push("  - TURNSTILE_EXPECTED_HOSTNAME: required when TURNSTILE_REQUIRED=true");
  }
  if (values.APP_MODE === "production" && values.EMAIL_PROVIDER === "disabled") {
    configurationIssues.push("  - EMAIL_PROVIDER: production authentication requires a configured transactional email provider");
  }
  if (values.EMAIL_PROVIDER === "http" && (!values.EMAIL_FROM || !values.EMAIL_HTTP_URL || !values.EMAIL_HTTP_API_KEY)) {
    configurationIssues.push("  - EMAIL_FROM/EMAIL_HTTP_URL/EMAIL_HTTP_API_KEY: required when EMAIL_PROVIDER=http");
  }
  if (values.APP_MODE === "production" && values.EMAIL_PROVIDER === "console") {
    configurationIssues.push("  - EMAIL_PROVIDER: console email delivery is not allowed in production");
  }
  if (values.APP_MODE === "production" && values.EMAIL_PROVIDER === "http" && values.EMAIL_HTTP_URL && new URL(values.EMAIL_HTTP_URL).protocol !== "https:") {
    configurationIssues.push("  - EMAIL_HTTP_URL: production email delivery requires an HTTPS endpoint");
  }
  if (values.GA4_ENABLED && values.APP_MODE === "production") {
    if (values.GA4_PROVIDER_MODE !== "google") configurationIssues.push("  - GA4_PROVIDER_MODE: production GA4 requires GA4_PROVIDER_MODE=google");
    if (!values.GA4_OAUTH_CLIENT_ID) configurationIssues.push("  - GA4_OAUTH_CLIENT_ID: required when GA4_ENABLED=true in production");
    if (!values.GA4_OAUTH_CLIENT_SECRET) configurationIssues.push("  - GA4_OAUTH_CLIENT_SECRET: required when GA4_ENABLED=true in production");
    if (!values.GA4_OAUTH_REDIRECT_URI) configurationIssues.push("  - GA4_OAUTH_REDIRECT_URI: required when GA4_ENABLED=true in production");
    if (!isAes256Key(values.GA4_TOKEN_ENCRYPTION_KEY)) configurationIssues.push("  - GA4_TOKEN_ENCRYPTION_KEY: production requires a 32-byte base64 or 64-character hex key");
  }
  if (values.GA4_ENABLED && values.GA4_PROVIDER_MODE === "google" && (!values.GA4_OAUTH_CLIENT_ID || !values.GA4_OAUTH_CLIENT_SECRET || !values.GA4_OAUTH_REDIRECT_URI)) {
    configurationIssues.push("  - GA4 OAuth client ID, secret, and redirect URI: required when GA4_PROVIDER_MODE=google");
  }
  if (values.GA4_ENABLED && values.GA4_TOKEN_ENCRYPTION_KEY && !isAes256Key(values.GA4_TOKEN_ENCRYPTION_KEY)) {
    configurationIssues.push("  - GA4_TOKEN_ENCRYPTION_KEY: must decode to exactly 32 bytes");
  }
  if (values.APP_MODE === "demo" && values.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    configurationIssues.push("  - STRIPE_SECRET_KEY: demo mode cannot use a live Stripe secret");
  }
  if (values.STRIPE_TEST_MODE_REQUIRED && values.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    configurationIssues.push("  - STRIPE_TEST_MODE_REQUIRED: live Stripe keys are not allowed while test mode is required");
  }
  if ((values.STRIPE_ENABLED || values.BOOST_LIVE_MODE_ENABLED) && values.STRIPE_TEST_MODE_REQUIRED && values.STRIPE_SECRET_KEY && !values.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    configurationIssues.push("  - STRIPE_SECRET_KEY: test-mode release gates require a sk_test_ key");
  }
  if (values.BOOST_LIVE_MODE_ENABLED && values.APP_MODE !== "production") {
    configurationIssues.push("  - BOOST_LIVE_MODE_ENABLED: live Boost mode requires APP_MODE=production");
  }
  if (values.BOOST_LIVE_MODE_ENABLED && !values.BOOST_ENABLED) {
    configurationIssues.push("  - BOOST_ENABLED: must be true when BOOST_LIVE_MODE_ENABLED=true");
  }
  if (values.NEXT_PUBLIC_COMMERCIAL_ENABLED && (!values.BOOST_ENABLED || !values.STRIPE_ENABLED)) {
    configurationIssues.push("  - NEXT_PUBLIC_COMMERCIAL_ENABLED: public commercial UI requires BOOST_ENABLED=true and STRIPE_ENABLED=true");
  }
  if (values.NEXT_PUBLIC_RADAR_ENABLED && !values.CLOUDFLARE_RADAR_API_TOKEN) {
    configurationIssues.push("  - CLOUDFLARE_RADAR_API_TOKEN: required when NEXT_PUBLIC_RADAR_ENABLED=true");
  }
  if (values.BOOST_LIVE_MODE_ENABLED || values.STRIPE_ENABLED) {
    if (!values.STRIPE_SECRET_KEY) configurationIssues.push("  - STRIPE_SECRET_KEY: required when Stripe/Boost live mode is enabled");
    if (!values.STRIPE_WEBHOOK_SECRET) configurationIssues.push("  - STRIPE_WEBHOOK_SECRET: required when Stripe/Boost live mode is enabled");
    if (!values.STRIPE_CHECKOUT_SUCCESS_URL) configurationIssues.push("  - STRIPE_CHECKOUT_SUCCESS_URL: required when Stripe/Boost live mode is enabled");
    if (!values.STRIPE_CHECKOUT_CANCEL_URL) configurationIssues.push("  - STRIPE_CHECKOUT_CANCEL_URL: required when Stripe/Boost live mode is enabled");
  }
  if (values.BOOST_LIVE_MODE_ENABLED && (!values.BOOST_STARTER_PRICE_ID || !values.BOOST_GROWTH_PRICE_ID || !values.BOOST_LAUNCH_PRICE_ID)) {
    configurationIssues.push("  - BOOST_*_PRICE_ID: Starter, Growth, and Launch Price IDs are required for live Boost mode");
  }
  if (values.ANALYTICS_PROVIDER === "tinybird" && (!values.TINYBIRD_API_URL || !values.TINYBIRD_INGEST_TOKEN || !values.TINYBIRD_READ_TOKEN)) {
    configurationIssues.push("  - TINYBIRD_API_URL/TINYBIRD_INGEST_TOKEN/TINYBIRD_READ_TOKEN: required when ANALYTICS_PROVIDER=tinybird");
  }
  if (values.QUEUE_PROVIDER === "cloudflare" && (!values.CLOUDFLARE_ACCOUNT_ID || !values.CLOUDFLARE_API_TOKEN)) {
    configurationIssues.push("  - CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN: required when QUEUE_PROVIDER=cloudflare");
  }
  if (values.REALTIME_PROVIDER === "durable_objects" && (!values.CLOUDFLARE_ACCOUNT_ID || !values.CLOUDFLARE_API_TOKEN)) {
    configurationIssues.push("  - CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN: required when REALTIME_PROVIDER=durable_objects");
  }
  if (values.REALTIME_PROVIDER === "durable_objects" && !values.REALTIME_SERVICE_URL) {
    configurationIssues.push("  - REALTIME_SERVICE_URL: required when REALTIME_PROVIDER=durable_objects");
  }
  if (values.TRACKER_ENABLED && (!values.TRACKER_SIGNING_SECRET || values.TRACKER_SIGNING_SECRET.length < 32)) {
    configurationIssues.push("  - TRACKER_SIGNING_SECRET: required with at least 32 characters when TRACKER_ENABLED=true");
  }
  if (values.TRACKER_ENABLED && (!(values.TRACKER_HASH_SECRET ?? values.TRACKER_HASH_SALT) || (values.TRACKER_HASH_SECRET ?? values.TRACKER_HASH_SALT)!.length < 32)) {
    configurationIssues.push("  - TRACKER_HASH_SECRET: required with at least 32 characters when TRACKER_ENABLED=true");
  }
  if (values.TRACKER_ENABLED && (!values.TRACKER_KEY_ROTATION_SECRET || values.TRACKER_KEY_ROTATION_SECRET.length < 32)) {
    configurationIssues.push("  - TRACKER_KEY_ROTATION_SECRET: required with at least 32 characters when TRACKER_ENABLED=true");
  }
  if (values.QUEUE_PROVIDER === "cloudflare" && !values.INTERNAL_INGEST_URL && values.ANALYTICS_PROVIDER === "postgres") {
    configurationIssues.push("  - INTERNAL_INGEST_URL: required for a Cloudflare queue with the Postgres event store");
  }
  if (configurationIssues.length > 0) {
    throw new Error(`Invalid environment configuration:\n${configurationIssues.join("\n")}\n\nCopy .env.example to apps/web/.env and fill in the required values.`);
  }
  cached = values;
  return cached;
}

function isAes256Key(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const decoded = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
    return decoded.length === 32;
  } catch {
    return false;
  }
}

export function isDemoMode(): boolean {
  return getServerEnv().APP_MODE === "demo";
}

export function isProduction(): boolean {
  return getServerEnv().APP_MODE === "production";
}

export function dataProviderName(): ServerEnv["DATA_PROVIDER"] {
  return getServerEnv().DATA_PROVIDER;
}

/** Useful for isolated unit tests that mutate process.env between cases. */
export function resetServerEnvCache(): void {
  cached = null;
}

export function featureFlags() {
  return {
    creators: process.env.FEATURE_CREATORS === "true",
    campaigns: process.env.FEATURE_CAMPAIGNS === "true",
    auction: process.env.FEATURE_AUCTION === "true",
    publicApi: process.env.FEATURE_PUBLIC_API === "true",
  };
}
