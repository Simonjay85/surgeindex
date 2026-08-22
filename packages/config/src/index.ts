import { z } from "zod";

/**
 * Server-side environment schema. Demo mode is deliberately explicit. A
 * production process may never silently select the deterministic provider.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["demo", "production"]),
  DATA_PROVIDER: z.enum(["demo", "postgres"]),
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
  TRACKER_HASH_SALT: z.string().optional(),
  TRACKER_SIGNING_SECRET: z.string().optional(),
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
