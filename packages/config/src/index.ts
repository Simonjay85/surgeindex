import { z } from "zod";

/**
 * Server-side environment schema. Everything except DATABASE_URL and
 * BETTER_AUTH_SECRET has a demo-safe default so the project runs with zero
 * external credentials (DEMO_MODE=true).
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  NEXT_PUBLIC_APP_NAME: z.string().default("SurgeIndex"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  DB_DRIVER: z.enum(["pg", "neon"]).default("pg"),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be set"),
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
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to apps/web/.env and fill in the required values.`,
    );
  }
  cached = parsed.data;
  return cached;
}

export function isDemoMode(): boolean {
  // Anything other than an explicit DEMO_MODE=false in production counts as
  // demo until real credentials are wired.
  return process.env.DEMO_MODE !== "false";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true";
}

export function featureFlags() {
  return {
    creators: process.env.FEATURE_CREATORS === "true",
    campaigns: process.env.FEATURE_CAMPAIGNS === "true",
    auction: process.env.FEATURE_AUCTION === "true",
    publicApi: process.env.FEATURE_PUBLIC_API === "true",
  };
}
