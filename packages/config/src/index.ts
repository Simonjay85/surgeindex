import { z } from "zod";

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
  NEXT_PUBLIC_APP_NAME: z.string().default("SurgeIndex"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
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
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
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
