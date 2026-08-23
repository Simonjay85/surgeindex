/**
 * SurgeIndex database schema (PostgreSQL via Drizzle ORM).
 *
 * Conventions:
 *  - UUID primary keys (gen_random_uuid()).
 *  - created_at / updated_at timestamptz everywhere relevant.
 *  - Soft deletion via deleted_at where operationally useful.
 *  - No raw IP addresses anywhere — only rotating-salt hashes.
 */
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ─────────────────────────── Enums ─────────────────────────── */

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const siteStatusEnum = pgEnum("site_status", ["pending", "active", "suspended", "rejected"]);
export const verificationStatusEnum = pgEnum("verification_status", ["unverified", "tracker", "ga4"]);
export const ownershipStatusEnum = pgEnum("ownership_status", ["unclaimed", "claimed"]);
export const claimMethodEnum = pgEnum("claim_method", ["meta_tag", "html_file", "dns_txt", "tracker", "ga4"]);
export const claimStatusEnum = pgEnum("claim_status", ["pending", "verified", "failed", "expired"]);
export const dataSourceEnum = pgEnum("data_source", ["tracker", "ga4", "surgeindex", "sponsored", "demo", "unverified"]);
export const trackerKeyStatusEnum = pgEnum("tracker_key_status", ["pending", "active", "stale", "rotated", "revoked"]);
export const snapshotGranularityEnum = pgEnum("snapshot_granularity", ["hour", "day"]);
export const rankWindowEnum = pgEnum("rank_window", ["live", "24h", "7d"]);
export const rankingStateEnum = pgEnum("ranking_state", ["unverified", "building_baseline", "provisional", "eligible", "stale", "suspended", "fraud_review", "ineligible"]);
export const freshnessStateEnum = pgEnum("freshness_state", ["live", "fresh", "delayed", "stale", "offline"]);
export const breakoutStateEnum = pgEnum("breakout_state", ["none", "watch", "breaking_out", "surging", "cooling", "resolved", "invalidated"]);
export const breakoutStrengthEnum = pgEnum("breakout_strength", ["moderate", "strong", "exceptional"]);
export const scoringJobStatusEnum = pgEnum("scoring_job_status", ["running", "completed", "failed"]);
export const activityTypeEnum = pgEnum("activity_type", [
  "site_submitted",
  "site_approved",
  "site_rejected",
  "site_verified",
  "ownership_verification_started",
  "ownership_verified",
  "category_changed",
  "site_suspended",
  "site_restored",
  "entered_top_10",
  "rank_up",
  "surging",
  "boost_started",
  "boost_completed",
  "badge_earned",
  "tracker_key_generated",
  "tracker_first_detected",
  "tracker_connected",
  "tracker_stale",
  "tracker_reconnected",
  "tracker_key_rotated",
  "tracker_key_revoked",
  "surgeindex_attributed_visit",
  "breakout_entered",
  "breakout_cooling",
  "breakout_resolved",
  "league_changed",
  "score_recomputed",
]);
export const boostStatusEnum = pgEnum("boost_status", [
  "draft",
  "pending_payment",
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
  "refunded",
]);
export const boostPlacementEnum = pgEnum("boost_placement", [
  "homepage",
  "category",
  "ranking_feed",
  "profile_recommendation",
  "breakout_feed",
]);
export const paymentProviderEnum = pgEnum("payment_provider", ["mock", "stripe"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);
export const fraudDecisionEnum = pgEnum("fraud_decision", ["valid", "suspected", "invalid", "review_required"]);
export const fraudSubjectEnum = pgEnum("fraud_subject", ["event", "click", "site"]);
export const gaStatusEnum = pgEnum("ga_status", ["active", "disconnected", "error", "quota_exceeded"]);
/** GA4 lifecycle is kept separate from the legacy traffic-verification status. */
export const gaConnectionStateEnum = pgEnum("ga_connection_state", [
  "initiated",
  "authorizing",
  "selecting_property",
  "validating_property",
  "backfilling",
  "connected",
  "degraded",
  "reauthorization_required",
  "revoked",
  "disconnected",
  "error",
]);
export const gaSyncTypeEnum = pgEnum("ga_sync_type", ["realtime", "core_recent", "historical_reconciliation", "initial_backfill", "token_health", "freshness_check"]);
export const gaSyncRunStatusEnum = pgEnum("ga_sync_run_status", ["queued", "running", "completed", "partial", "failed", "cancelled"]);
export const gaBackfillStatusEnum = pgEnum("ga_backfill_status", ["queued", "running", "partially_complete", "complete", "failed", "cancelled"]);
export const gaReportWindowEnum = pgEnum("ga_report_window", ["yesterday", "7d", "28d", "30d", "90d", "realtime_5m", "realtime_30m"]);
export const rankingSourceEnum = pgEnum("ranking_source", ["tracker", "ga4"]);
export const gaQuotaApiEnum = pgEnum("ga_quota_api", ["core", "realtime"]);
export const ownerRoleEnum = pgEnum("owner_role", ["owner", "editor"]);
export const boostCampaignStateEnum = pgEnum("boost_campaign_state", [
  "draft",
  "inventory_check",
  "awaiting_checkout",
  "inventory_reserved",
  "pending_payment",
  "payment_processing",
  "paid",
  "paid_pending_inventory_review",
  "scheduled",
  "active",
  "paused",
  "delivery_complete",
  "completed",
  "underdelivered",
  "cancel_requested",
  "cancelled",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "payment_failed",
  "checkout_expired",
  "disputed",
  "suspended",
]);
export const boostReservationStatusEnum = pgEnum("boost_reservation_status", ["held", "confirmed", "released", "expired"]);
export const boostCreativeStateEnum = pgEnum("boost_creative_state", ["draft", "pending_review", "approved", "rejected", "suspended"]);
export const boostImpressionClassificationEnum = pgEnum("boost_impression_classification", ["opportunity", "rendered", "qualified", "duplicate", "invalid", "suspected", "viewability_failed", "expired_token", "frequency_capped", "owner_self_view"]);
export const stripeEnvironmentEnum = pgEnum("stripe_environment", ["test", "live"]);
export const boostPaymentStatusEnum = pgEnum("boost_payment_status", ["pending", "processing", "succeeded", "failed", "expired", "partially_refunded", "refunded", "disputed"]);
export const boostRefundStatusEnum = pgEnum("boost_refund_status", ["requested", "processing", "succeeded", "failed", "cancelled"]);
export const boostDisputeStatusEnum = pgEnum("boost_dispute_status", ["open", "won", "lost", "closed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
};

/* ─────────────────────── Identity (Better Auth) ─────────────────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("user"),
  isDemo: boolean("is_demo").notNull().default(false),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    /** Better Auth 1.7 scopes account identity by issuer. */
    issuer: text("issuer").notNull().default("credential"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verificationToken = pgTable("verification_token", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  ...timestamps,
});

/* ─────────────────────────── Taxonomy ─────────────────────────── */

export const category = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/* ─────────────────────────── Sites ─────────────────────────── */

export const site = pgTable(
  "site",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    domain: text("domain").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    status: siteStatusEnum("status").notNull().default("pending"),
    verification: verificationStatusEnum("verification").notNull().default("unverified"),
    ownership: ownershipStatusEnum("ownership").notNull().default("unclaimed"),
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),
    ogImageUrl: text("og_image_url"),
    submittedByUserId: text("submitted_by_user_id").references(() => user.id, { onDelete: "set null" }),
    featured: boolean("featured").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("site_category_idx").on(t.categoryId),
    index("site_status_idx").on(t.status),
    index("site_domain_idx").on(t.domain),
  ],
);

export const siteTag = pgTable(
  "site_tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [unique("site_tag_unique").on(t.siteId, t.tag)],
);

/** Optional secondary categories. site.category_id remains the primary category. */
export const siteCategory = pgTable(
  "site_category",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.categoryId] }),
    index("site_category_category_idx").on(t.categoryId),
  ],
);

export const siteOwner = pgTable(
  "site_owner",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: ownerRoleEnum("role").notNull().default("owner"),
    createdAt: timestamps.createdAt,
  },
  (t) => [unique("site_owner_unique").on(t.siteId, t.userId)],
);

/** Ownership verification attempts (separate from traffic verification). */
export const siteClaim = pgTable(
  "site_claim",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    method: claimMethodEnum("method").notNull(),
    token: text("token").notNull().unique(),
    status: claimStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    requestedAt: timestamps.createdAt,
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("site_claim_site_idx").on(t.siteId, t.status),
    index("site_claim_user_idx").on(t.userId, t.status),
  ],
);

/** Traffic data source verification state (one row per site). */
export const siteVerification = pgTable("site_verification", {
  siteId: uuid("site_id")
    .primaryKey()
    .references(() => site.id, { onDelete: "cascade" }),
  source: dataSourceEnum("source").notNull().default("unverified"),
  method: claimMethodEnum("method"),
  status: gaStatusEnum("status").notNull().default("disconnected"),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const trackerKey = pgTable(
  "tracker_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull().unique(),
    allowedDomains: text("allowed_domains").array().notNull(),
    // The enum values are introduced in a separate migration transaction;
    // key-management mutations always set the state explicitly.
    status: trackerKeyStatusEnum("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    environment: text("environment").notNull().default("production"),
    createdAt: timestamps.createdAt,
    activatedAt: timestamp("activated_at", { withTimezone: true, mode: "date" }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true, mode: "date" }),
    lastOrigin: text("last_origin"),
    lastError: text("last_error"),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("tracker_key_site_idx").on(t.siteId), index("tracker_key_status_idx").on(t.status)],
);

export const gaConnection = pgTable("ga_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  siteId: uuid("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" })
    .unique(),
  propertyId: text("property_id").notNull(),
  propertyName: text("property_name"),
  streamId: text("stream_id"),
  streamName: text("stream_name"),
  streamDefaultUri: text("stream_default_uri"),
  measurementId: text("measurement_id"),
  domainMatchState: text("domain_match_state"),
  propertyTimeZone: text("property_time_zone"),
  currencyCode: text("currency_code"),
  grantedScopes: text("granted_scopes").array().notNull().default(sql`ARRAY[]::text[]`),
  googleSubject: text("google_subject"),
  grantIdentity: text("grant_identity"),
  /** Deprecated compatibility column. New credentials live in ga_credential. */
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  status: gaStatusEnum("status").notNull().default("active"),
  connectionState: gaConnectionStateEnum("connection_state").notNull().default("initiated"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: "date" }),
  lastSuccessfulReportAt: timestamp("last_successful_report_at", { withTimezone: true, mode: "date" }),
  lastRefreshAt: timestamp("last_refresh_at", { withTimezone: true, mode: "date" }),
  lastRefreshFailure: text("last_refresh_failure"),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  connectedAt: timestamp("connected_at", { withTimezone: true, mode: "date" }),
  rankingEligible: boolean("ranking_eligible").notNull().default(false),
  providerSchemaVersion: text("provider_schema_version").notNull().default("unknown"),
  lastError: text("last_error"),
  ...timestamps,
}, (t) => [index("ga_connection_state_idx").on(t.connectionState, t.updatedAt), index("ga_connection_grant_idx").on(t.grantIdentity)]);

/** Short-lived server-side OAuth transaction. Raw state is never persisted. */
export const gaOauthTransaction = pgTable(
  "ga_oauth_transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    stateHash: text("state_hash").notNull().unique(),
    pkceVerifierEncrypted: text("pkce_verifier_encrypted").notNull(),
    pkceKeyVersion: text("pkce_key_version").notNull(),
    returnPath: text("return_path").notNull().default("/dashboard"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [index("ga_oauth_transaction_lookup_idx").on(t.siteId, t.userId, t.expiresAt), index("ga_oauth_transaction_open_idx").on(t.expiresAt, t.completedAt)],
);

/** Encrypted credential material is only accessed by the GA4 provider boundary. */
export const gaCredential = pgTable(
  "ga_credential",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }).unique(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    encryptionKeyVersion: text("encryption_key_version").notNull(),
    grantedScopes: text("granted_scopes").array().notNull().default(sql`ARRAY[]::text[]`),
    googleSubject: text("google_subject"),
    grantIdentity: text("grant_identity"),
    encryptedAccessToken: text("encrypted_access_token"),
    accessTokenKeyVersion: text("access_token_key_version"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
    tokenCreatedAt: timestamp("token_created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSuccessfulRefresh: timestamp("last_successful_refresh", { withTimezone: true, mode: "date" }),
    lastRefreshFailure: timestamp("last_refresh_failure", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [index("ga_credential_grant_idx").on(t.grantIdentity), index("ga_credential_refresh_idx").on(t.lastRefreshFailure)],
);

export const gaAccount = pgTable(
  "ga_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull(),
    displayName: text("display_name").notNull(),
    ...timestamps,
  },
  (t) => [unique("ga_account_connection_resource_unique").on(t.connectionId, t.resourceId), index("ga_account_connection_idx").on(t.connectionId)],
);

export const gaProperty = pgTable(
  "ga_property",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => gaAccount.id, { onDelete: "set null" }),
    resourceId: text("resource_id").notNull(),
    displayName: text("display_name").notNull(),
    propertyType: text("property_type"),
    timeZone: text("time_zone"),
    currencyCode: text("currency_code"),
    ...timestamps,
  },
  (t) => [unique("ga_property_connection_resource_unique").on(t.connectionId, t.resourceId), index("ga_property_connection_idx").on(t.connectionId)],
);

export const gaDataStream = pgTable(
  "ga_data_stream",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull().references(() => gaProperty.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull(),
    displayName: text("display_name").notNull(),
    streamType: text("stream_type").notNull(),
    defaultUri: text("default_uri"),
    measurementId: text("measurement_id"),
    timeZone: text("time_zone"),
    domainMatchState: text("domain_match_state"),
    ...timestamps,
  },
  (t) => [unique("ga_stream_property_resource_unique").on(t.propertyId, t.resourceId), index("ga_stream_property_idx").on(t.propertyId)],
);

export const gaPropertyCapability = pgTable(
  "ga_property_capability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id").notNull().references(() => gaProperty.id, { onDelete: "cascade" }).unique(),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" }).notNull(),
    supportedMetrics: text("supported_metrics").array().notNull().default(sql`ARRAY[]::text[]`),
    unsupportedMetrics: text("unsupported_metrics").array().notNull().default(sql`ARRAY[]::text[]`),
    compatibilityErrors: text("compatibility_errors").array().notNull().default(sql`ARRAY[]::text[]`),
    providerSchemaVersion: text("provider_schema_version").notNull(),
    ...timestamps,
  },
);

export const gaSyncJob = pgTable(
  "ga_sync_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }),
    syncType: gaSyncTypeEnum("sync_type").notNull(),
    status: gaSyncRunStatusEnum("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(50),
    nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "date" }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "date" }),
    lastErrorCode: text("last_error_code"),
    pausedAt: timestamp("paused_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [unique("ga_sync_job_connection_type_unique").on(t.connectionId, t.syncType), index("ga_sync_job_due_idx").on(t.status, t.nextRunAt)],
);

export const gaSyncRun = pgTable(
  "ga_sync_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => gaSyncJob.id, { onDelete: "set null" }),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }),
    syncType: gaSyncTypeEnum("sync_type").notNull(),
    status: gaSyncRunStatusEnum("status").notNull().default("running"),
    window: text("window"),
    requestCount: integer("request_count").notNull().default(0),
    quotaBefore: jsonb("quota_before").$type<Record<string, unknown>>(),
    quotaAfter: jsonb("quota_after").$type<Record<string, unknown>>(),
    rowsReceived: integer("rows_received").notNull().default(0),
    rowsPersisted: integer("rows_persisted").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    requestId: text("request_id"),
    ...timestamps,
  },
  (t) => [index("ga_sync_run_connection_time_idx").on(t.connectionId, t.startedAt), index("ga_sync_run_status_idx").on(t.status, t.startedAt)],
);

export const gaBackfillJob = pgTable(
  "ga_backfill_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    totalDays: integer("total_days").notNull(),
    processedDays: integer("processed_days").notNull().default(0),
    checkpointDate: date("checkpoint_date"),
    status: gaBackfillStatusEnum("status").notNull().default("queued"),
    dryRun: boolean("dry_run").notNull().default(false),
    lastErrorCode: text("last_error_code"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [unique("ga_backfill_connection_window_unique").on(t.connectionId, t.startDate, t.endDate), index("ga_backfill_status_idx").on(t.status, t.updatedAt)],
);

export const gaQuotaSnapshot = pgTable(
  "ga_quota_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }),
    api: gaQuotaApiEnum("api").notNull(),
    state: text("state").notNull().default("unknown"),
    remainingTokens: integer("remaining_tokens"),
    concurrentRequests: integer("concurrent_requests"),
    serverErrorQuota: integer("server_error_quota"),
    last429At: timestamp("last_429_at", { withTimezone: true, mode: "date" }),
    retryAfterSeconds: integer("retry_after_seconds"),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => [index("ga_quota_connection_api_time_idx").on(t.connectionId, t.api, t.observedAt)],
);

export const gaReportSnapshot = pgTable(
  "ga_report_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    window: gaReportWindowEnum("window").notNull(),
    requestedStartDate: date("requested_start_date").notNull(),
    requestedEndDate: date("requested_end_date").notNull(),
    propertyTimeZone: text("property_time_zone"),
    metricDefinitions: text("metric_definitions").array().notNull().default(sql`ARRAY[]::text[]`),
    providerResponseMetadata: jsonb("provider_response_metadata").$type<Record<string, unknown>>(),
    importedAt: timestamp("imported_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    dataDate: date("data_date"),
    partial: boolean("partial").notNull().default(false),
    dataMayStillChange: boolean("data_may_still_change").notNull().default(false),
    providerGeneratedAt: timestamp("provider_generated_at", { withTimezone: true, mode: "date" }),
    providerSchemaVersion: text("provider_schema_version").notNull(),
  },
  (t) => [index("ga_report_connection_window_idx").on(t.connectionId, t.window, t.importedAt)],
);

export const gaRealtimeSnapshot = pgTable(
  "ga_realtime_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    propertyId: text("property_id").notNull(),
    minuteRangeStart: timestamp("minute_range_start", { withTimezone: true, mode: "date" }).notNull(),
    minuteRangeEnd: timestamp("minute_range_end", { withTimezone: true, mode: "date" }).notNull(),
    activeUsers: integer("active_users").notNull().default(0),
    screenPageViews: integer("screen_page_views").notNull().default(0),
    eventCount: integer("event_count").notNull().default(0),
    keyEvents: integer("key_events").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    providerGeneratedAt: timestamp("provider_generated_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    providerSchemaVersion: text("provider_schema_version").notNull(),
  },
  (t) => [unique("ga_realtime_connection_window_unique").on(t.connectionId, t.minuteRangeStart, t.minuteRangeEnd), index("ga_realtime_site_time_idx").on(t.siteId, t.fetchedAt)],
);

export const gaMetricAggregate = pgTable(
  "ga_metric_aggregate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => gaConnection.id, { onDelete: "cascade" }),
    source: rankingSourceEnum("source").notNull().default("ga4"),
    metricName: text("metric_name").notNull(),
    window: text("window").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true, mode: "date" }).notNull(),
    bucketEnd: timestamp("bucket_end", { withTimezone: true, mode: "date" }).notNull(),
    value: numeric("value", { precision: 20, scale: 6 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    freshness: freshnessStateEnum("freshness").notNull().default("fresh"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("1"),
    providerDefinitionVersion: text("provider_definition_version").notNull(),
    partial: boolean("partial").notNull().default(false),
    dataMayStillChange: boolean("data_may_still_change").notNull().default(false),
    ...timestamps,
  },
  (t) => [unique("ga_metric_aggregate_bucket_unique").on(t.connectionId, t.source, t.metricName, t.window, t.bucketStart), index("ga_metric_site_metric_time_idx").on(t.siteId, t.metricName, t.bucketStart)],
);

/** One explicit primary ranking source per site. GA4 connection alone never mutates this row. */
export const siteMetricSourcePolicy = pgTable("site_metric_source_policy", {
  siteId: uuid("site_id").primaryKey().references(() => site.id, { onDelete: "cascade" }),
  primarySource: rankingSourceEnum("primary_source").notNull().default("tracker"),
  rankingSourceVersion: text("ranking_source_version").notNull().default("tracker-v1"),
  rankingSourceStartedAt: timestamp("ranking_source_started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  rankingSourceLockedUntil: timestamp("ranking_source_locked_until", { withTimezone: true, mode: "date" }),
  previousRankingSource: rankingSourceEnum("previous_ranking_source"),
  sourceSwitchReason: text("source_switch_reason"),
  provisionalUntil: timestamp("provisional_until", { withTimezone: true, mode: "date" }),
  baselineCompatible: boolean("baseline_compatible").notNull().default(true),
  ...timestamps,
});

export const siteMetricSourceTransition = pgTable(
  "site_metric_source_transition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    fromSource: rankingSourceEnum("from_source"),
    toSource: rankingSourceEnum("to_source").notNull(),
    reason: text("reason").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    requestId: text("request_id").notNull(),
    baselineCompatibleBefore: boolean("baseline_compatible_before").notNull().default(true),
    baselineCompatibleAfter: boolean("baseline_compatible_after").notNull().default(false),
    provisionalUntil: timestamp("provisional_until", { withTimezone: true, mode: "date" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("source_transition_site_time_idx").on(t.siteId, t.occurredAt)],
);

/* ─────────────────────────── Metrics ─────────────────────────── */

/** One row per site: the current, hot metric set powering the leaderboard. */
export const siteMetricCurrent = pgTable(
  "site_metric_current",
  {
    siteId: uuid("site_id")
      .primaryKey()
      .references(() => site.id, { onDelete: "cascade" }),
    activeNow: integer("active_now"),
    activeLast30m: integer("active_last_30m"),
    visitors24h: bigint("visitors_24h", { mode: "number" }),
    visitors7d: bigint("visitors_7d", { mode: "number" }),
    pageviews24h: bigint("pageviews_24h", { mode: "number" }),
    sessions24h: bigint("sessions_24h", { mode: "number" }),
    engagedSessions24h: bigint("engaged_sessions_24h", { mode: "number" }),
    activeSessions: integer("active_sessions"),
    surgeAttributedVisits24h: integer("surge_attributed_visits_24h").notNull().default(0),
    surgeAttributedEngagedVisits24h: integer("surge_attributed_engaged_visits_24h").notNull().default(0),
    engagementRate: numeric("engagement_rate", { precision: 5, scale: 4 }),
    avgEngagementSeconds: integer("avg_engagement_seconds"),
    baselineDailyVisitors: bigint("baseline_daily_visitors", { mode: "number" }),
    typicalActiveNow: integer("typical_active_now"),
    growth24hPct: numeric("growth_24h_pct", { precision: 8, scale: 2 }),
    growth7dPct: numeric("growth_7d_pct", { precision: 8, scale: 2 }),
    surgeReferrals24h: integer("surge_referrals_24h").notNull().default(0),
    heatScore: integer("heat_score").notNull().default(0),
    rawScore: numeric("raw_score", { precision: 6, scale: 3 }).notNull().default("0"),
    smoothedScore: numeric("smoothed_score", { precision: 6, scale: 3 }).notNull().default("0"),
    heatLeague: text("heat_league").notNull().default("new"),
    rankingState: rankingStateEnum("ranking_state").notNull().default("unverified"),
    freshness: freshnessStateEnum("freshness").notNull().default("offline"),
    dataConfidence: numeric("data_confidence", { precision: 5, scale: 4 }).notNull().default("0"),
    scoreVersion: text("score_version").notNull().default("v1"),
    rankingSource: rankingSourceEnum("ranking_source").notNull().default("tracker"),
    providerDefinitionVersion: text("provider_definition_version").notNull().default("tracker-v1"),
    fraudPenalty: numeric("fraud_penalty", { precision: 4, scale: 3 }).notNull().default("0"),
    acceptedEvents24h: integer("accepted_events_24h").notNull().default(0),
    suspectedEvents24h: integer("suspected_events_24h").notNull().default(0),
    invalidEvents24h: integer("invalid_events_24h").notNull().default(0),
    lastAcceptedEventAt: timestamp("last_accepted_event_at", { withTimezone: true, mode: "date" }),
    lastDetectedOrigin: text("last_detected_origin"),
    trackerVersion: text("tracker_version"),
    lastBaselineAt: timestamp("last_baseline_at", { withTimezone: true, mode: "date" }),
    lastScoreAt: timestamp("last_score_at", { withTimezone: true, mode: "date" }),
    breakoutState: breakoutStateEnum("breakout_state").notNull().default("none"),
    breakoutStrength: breakoutStrengthEnum("breakout_strength"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [index("site_metric_heat_idx").on(t.heatScore)],
);

/** Historical metric snapshots for charts and baseline computation. */
export const siteMetricSnapshot = pgTable(
  "site_metric_snapshot",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    granularity: snapshotGranularityEnum("granularity").notNull(),
    visitors: integer("visitors").notNull().default(0),
    sessions: integer("sessions").notNull().default(0),
    pageviews: integer("pageviews").notNull().default(0),
    engagedSessions: integer("engaged_sessions").notNull().default(0),
    attributedVisits: integer("attributed_visits").notNull().default(0),
    activeNow: integer("active_now").notNull().default(0),
    validEvents: integer("valid_events").notNull().default(0),
    dataCompleteness: numeric("data_completeness", { precision: 5, scale: 4 }).notNull().default("0"),
    growthPct: numeric("growth_pct", { precision: 8, scale: 2 }),
    heatScore: integer("heat_score").notNull().default(0),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    index("metric_snapshot_site_time_idx").on(t.siteId, t.granularity, t.capturedAt),
  ],
);

/** Rank history. scope is "global" or "category:<slug>". */
export const rankSnapshot = pgTable(
  "rank_snapshot",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    window: rankWindowEnum("window").notNull(),
    rank: integer("rank").notNull(),
    previousRank: integer("previous_rank"),
    scoreVersion: text("score_version").notNull().default("heat-v1"),
    rankingSource: rankingSourceEnum("ranking_source").notNull().default("tracker"),
    providerDefinitionVersion: text("provider_definition_version").notNull().default("tracker-v1"),
    displayedScore: integer("displayed_score").notNull().default(0),
    smoothedScore: numeric("smoothed_score", { precision: 6, scale: 3 }).notNull().default("0"),
    rankingState: rankingStateEnum("ranking_state").notNull().default("eligible"),
    league: text("league").notNull().default("new"),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    index("rank_snapshot_scope_time_idx").on(t.scope, t.window, t.capturedAt),
    unique("rank_snapshot_site_unique").on(t.siteId, t.scope, t.window, t.capturedAt),
  ],
);

export const scoreVersion = pgTable("score_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull().unique(),
  description: text("description").notNull().default(""),
  weights: jsonb("weights").$type<Record<string, number>>().notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(false),
});

/** One typed, queryable configuration record per scoring release. */
export const scoringConfig = pgTable(
  "scoring_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: text("version").notNull().unique(),
    description: text("description").notNull().default(""),
    weights: jsonb("weights").$type<Record<string, unknown>>().notNull(),
    baselineConfig: jsonb("baseline_config").$type<Record<string, unknown>>().notNull(),
    eligibilityConfig: jsonb("eligibility_config").$type<Record<string, unknown>>().notNull(),
    leagueConfig: jsonb("league_config").$type<Record<string, unknown>>().notNull(),
    smoothingConfig: jsonb("smoothing_config").$type<Record<string, unknown>>().notNull(),
    breakoutConfig: jsonb("breakout_config").$type<Record<string, unknown>>().notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("scoring_config_active_idx").on(t.isActive, t.releasedAt)],
);

/** Per-site historical baseline summary used by score jobs and explanations. */
export const siteBaseline = pgTable(
  "site_baseline",
  {
    siteId: uuid("site_id").primaryKey().references(() => site.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull().default("building_baseline"),
    expectedVisitors: bigint("expected_visitors", { mode: "number" }),
    lowerBound: bigint("lower_bound", { mode: "number" }),
    upperBound: bigint("upper_bound", { mode: "number" }),
    typicalActiveNow: integer("typical_active_now"),
    sampleCount: integer("sample_count").notNull().default(0),
    lookbackDays: integer("lookback_days").notNull().default(0),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
    dataCompleteness: numeric("data_completeness", { precision: 5, scale: 4 }).notNull().default("0"),
    source: rankingSourceEnum("source").notNull().default("tracker"),
    providerDefinitionVersion: text("provider_definition_version").notNull().default("tracker-v1"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("site_baseline_status_idx").on(t.status, t.updatedAt)],
);

/** Normalized hourly observations retained for baseline audit/backfill. */
export const baselineBucket = pgTable(
  "baseline_bucket",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true, mode: "date" }).notNull(),
    visitors: integer("visitors").notNull().default(0),
    sessions: integer("sessions").notNull().default(0),
    pageviews: integer("pageviews").notNull().default(0),
    engagedSessions: integer("engaged_sessions").notNull().default(0),
    activeNow: integer("active_now").notNull().default(0),
    validEvents: integer("valid_events").notNull().default(0),
    dataCompleteness: numeric("data_completeness", { precision: 5, scale: 4 }).notNull().default("1"),
    source: rankingSourceEnum("source").notNull().default("tracker"),
    createdAt: timestamps.createdAt,
  },
  (t) => [unique("baseline_bucket_site_source_time_unique").on(t.siteId, t.source, t.bucketStart), index("baseline_bucket_site_time_idx").on(t.siteId, t.bucketStart)],
);

/** Immutable score calculation record. One row per site/version/window/slot. */
export const siteScore = pgTable(
  "site_score",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    scoreVersion: text("score_version").notNull(),
    calculationWindow: text("calculation_window").notNull().default("live"),
    calculationSlot: timestamp("calculation_slot", { withTimezone: true, mode: "date" }).notNull(),
    inputWindowStart: timestamp("input_window_start", { withTimezone: true, mode: "date" }),
    inputWindowEnd: timestamp("input_window_end", { withTimezone: true, mode: "date" }),
    rankingState: rankingStateEnum("ranking_state").notNull(),
    freshness: freshnessStateEnum("freshness").notNull(),
    league: text("league").notNull(),
    rawScore: numeric("raw_score", { precision: 6, scale: 3 }).notNull(),
    smoothedScore: numeric("smoothed_score", { precision: 6, scale: 3 }).notNull(),
    displayedScore: integer("displayed_score").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    relativeLift: numeric("relative_lift", { precision: 10, scale: 4 }),
    absoluteLift: bigint("absolute_lift", { mode: "number" }),
    penalties: jsonb("penalties").$type<Array<{ code: string; amount: number; detail: string }>>().notNull(),
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull(),
    baselineSiteId: uuid("baseline_site_id").references(() => siteBaseline.siteId, { onDelete: "set null" }),
    rankingSource: rankingSourceEnum("ranking_source").notNull().default("tracker"),
    providerDefinitionVersion: text("provider_definition_version").notNull().default("tracker-v1"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    unique("site_score_slot_unique").on(t.siteId, t.scoreVersion, t.calculationWindow, t.calculationSlot),
    index("site_score_site_time_idx").on(t.siteId, t.createdAt),
    index("site_score_state_idx").on(t.rankingState, t.league, t.displayedScore),
  ],
);

export const siteScoreComponent = pgTable(
  "site_score_component",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scoreId: uuid("score_id").notNull().references(() => siteScore.id, { onDelete: "cascade" }),
    component: text("component").notNull(),
    normalizedValue: numeric("normalized_value", { precision: 6, scale: 3 }).notNull(),
    weight: numeric("weight", { precision: 5, scale: 4 }).notNull(),
    contribution: numeric("contribution", { precision: 6, scale: 3 }).notNull(),
    available: boolean("available").notNull().default(true),
    detail: text("detail").notNull().default(""),
    inputValues: jsonb("input_values").$type<Record<string, unknown>>(),
  },
  (t) => [unique("site_score_component_unique").on(t.scoreId, t.component), index("site_score_component_score_idx").on(t.scoreId)],
);

/** Transactionally published current leaderboard rows. */
export const currentRanking = pgTable(
  "current_ranking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    window: rankWindowEnum("window").notNull().default("live"),
    rank: integer("rank").notNull(),
    previousRank: integer("previous_rank"),
    scoreId: uuid("score_id").references(() => siteScore.id, { onDelete: "set null" }),
    scoreVersion: text("score_version").notNull(),
    rankingSource: rankingSourceEnum("ranking_source").notNull().default("tracker"),
    providerDefinitionVersion: text("provider_definition_version").notNull().default("tracker-v1"),
    displayedScore: integer("displayed_score").notNull(),
    smoothedScore: numeric("smoothed_score", { precision: 6, scale: 3 }).notNull(),
    rankingState: rankingStateEnum("ranking_state").notNull(),
    league: text("league").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    unique("current_ranking_site_scope_unique").on(t.siteId, t.scope, t.window),
    index("current_ranking_scope_rank_idx").on(t.scope, t.window, t.rank),
  ],
);

export const breakoutEvent = pgTable(
  "breakout_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    state: breakoutStateEnum("state").notNull().default("none"),
    strength: breakoutStrengthEnum("strength"),
    ruleVersion: text("rule_version").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true, mode: "date" }),
    activeSince: timestamp("active_since", { withTimezone: true, mode: "date" }),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    cooldownUntil: timestamp("cooldown_until", { withTimezone: true, mode: "date" }),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    baselineVisitors: bigint("baseline_visitors", { mode: "number" }),
    currentVisitors: bigint("current_visitors", { mode: "number" }),
    absoluteLift: bigint("absolute_lift", { mode: "number" }),
    relativeLift: numeric("relative_lift", { precision: 10, scale: 4 }),
    liveRatio: numeric("live_ratio", { precision: 10, scale: 4 }),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
    explanation: text("explanation").notNull().default(""),
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull(),
    peakMetrics: jsonb("peak_metrics").$type<Record<string, unknown>>(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [index("breakout_site_state_idx").on(t.siteId, t.state, t.lastEvaluatedAt), index("breakout_public_idx").on(t.state, t.strength, t.detectedAt)],
);

export const breakoutStateTransition = pgTable(
  "breakout_state_transition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    breakoutEventId: uuid("breakout_event_id").notNull().references(() => breakoutEvent.id, { onDelete: "cascade" }),
    fromState: breakoutStateEnum("from_state"),
    toState: breakoutStateEnum("to_state").notNull(),
    reason: text("reason").notNull().default(""),
    metrics: jsonb("metrics").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("breakout_transition_event_time_idx").on(t.breakoutEventId, t.occurredAt)],
);

export const scoringJobRun = pgTable(
  "scoring_job_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobType: text("job_type").notNull(),
    version: text("version").notNull(),
    runKey: text("run_key").notNull(),
    status: scoringJobStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    durationMs: integer("duration_ms"),
    sitesAttempted: integer("sites_attempted").notNull().default(0),
    sitesCompleted: integer("sites_completed").notNull().default(0),
    sitesSkipped: integer("sites_skipped").notNull().default(0),
    sitesFailed: integer("sites_failed").notNull().default(0),
    cursor: text("cursor"),
    error: text("error"),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [unique("scoring_job_run_key_unique").on(t.jobType, t.version, t.runKey), index("scoring_job_run_status_idx").on(t.jobType, t.status, t.startedAt)],
);

/* ──────────────────────── Platform activity ──────────────────────── */

export const activityEvent = pgTable(
  "activity_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: activityTypeEnum("type").notNull(),
    siteId: uuid("site_id").references(() => site.id, { onDelete: "cascade" }),
    detail: text("detail"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [index("activity_time_idx").on(t.occurredAt)],
);

export const outboundClick = pgTable(
  "outbound_click",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id"),
    placement: text("placement").notNull().default("organic"),
    trafficOrigin: text("traffic_origin").notNull().default("organic_surgedindex_referral"),
    visitorHash: text("visitor_hash").notNull(),
    referrerPath: text("referrer_path"),
    isUnique: boolean("is_unique").notNull().default(true),
    valid: boolean("valid").notNull().default(true),
    decision: fraudDecisionEnum("decision").notNull().default("valid"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    index("outbound_click_site_time_idx").on(t.siteId, t.occurredAt),
    index("outbound_click_visitor_idx").on(t.visitorHash, t.occurredAt),
    index("outbound_click_campaign_idx").on(t.campaignId),
  ],
);

/** Pre-aggregated daily referral counts (site × placement × day). */
export const outboundClickAggregate = pgTable(
  "outbound_click_aggregate",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    placement: text("placement").notNull(),
    day: date("day").notNull(),
    clicks: integer("clicks").notNull().default(0),
    uniqueClicks: integer("unique_clicks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.placement, t.day] })],
);

export const featureFlag = pgTable("feature_flag", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/* ─────────────────────── Boosts and billing ─────────────────────── */

export const boostPlacementDef = pgTable("boost_placement_def", {
  slug: boostPlacementEnum("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
});

/** Server-owned V1 placement catalog. The legacy enum-backed table remains for compatibility. */
export const boostPlacementConfig = pgTable("boost_placement_config", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  routePattern: text("route_pattern").notNull(),
  eligibleCategories: text("eligible_categories").array().notNull().default(sql`ARRAY[]::text[]`),
  deviceSupport: text("device_support").array().notNull().default(sql`ARRAY['desktop','mobile','tablet']::text[]`),
  creativeSpec: jsonb("creative_spec").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  frequencyPolicy: jsonb("frequency_policy").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  viewabilityRule: jsonb("viewability_rule").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const boostPackage = pgTable("boost_package", {
  id: uuid("id").primaryKey().defaultRandom(),
  packageKey: text("package_key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  currency: text("currency").notNull().default("USD"),
  amountCents: integer("amount_cents"),
  stripePriceId: text("stripe_price_id"),
  targetQualifiedImpressions: integer("target_qualified_impressions"),
  eligiblePlacements: text("eligible_placements").array().notNull().default(sql`ARRAY[]::text[]`),
  eligibleCategories: text("eligible_categories").array().notNull().default(sql`ARRAY[]::text[]`),
  defaultDurationDays: integer("default_duration_days").notNull().default(7),
  maximumDurationDays: integer("maximum_duration_days").notNull().default(30),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  ...timestamps,
});

export const boostCampaign = pgTable(
  "boost_campaign",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: boostStatusEnum("status").notNull().default("draft"),
    state: boostCampaignStateEnum("state").notNull().default("draft"),
    placement: boostPlacementEnum("placement").notNull(),
    placementKey: text("placement_key").notNull().default("homepage_boosted"),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    packageId: uuid("package_id").references(() => boostPackage.id, { onDelete: "set null" }),
    packageKey: text("package_key").notNull().default("custom"),
    packageSnapshot: jsonb("package_snapshot").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    headline: text("headline").notNull().default(""),
    shortDescription: text("short_description").notNull().default(""),
    ctaLabel: text("cta_label").notNull().default("Visit site"),
    destinationUrl: text("destination_url"),
    logoUrl: text("logo_url"),
    creativeVersion: integer("creative_version").notNull().default(1),
    pacingMode: text("pacing_mode").notNull().default("even"),
    budgetCents: integer("budget_cents").notNull().default(0),
    spendCents: integer("spend_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    targetImpressions: integer("target_impressions").notNull().default(0),
    deliveredImpressions: integer("delivered_impressions").notNull().default(0),
    renderedImpressions: integer("rendered_impressions").notNull().default(0),
    invalidImpressions: integer("invalid_impressions").notNull().default(0),
    validImpressions: integer("valid_impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    validClicks: integer("valid_clicks").notNull().default(0),
    uniqueClicks: integer("unique_clicks").notNull().default(0),
    attributedVisits: integer("attributed_visits").notNull().default(0),
    attributedEngagedVisits: integer("attributed_engaged_visits").notNull().default(0),
    ownerSelfViewExcluded: boolean("owner_self_view_excluded").notNull().default(true),
    startAt: timestamp("start_at", { withTimezone: true, mode: "date" }),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }),
    dailyCap: integer("daily_cap"),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    activatedAt: timestamp("activated_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    paymentReference: text("payment_reference"),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    index("boost_campaign_status_idx").on(t.status, t.placement),
    index("boost_campaign_site_idx").on(t.siteId),
    index("boost_campaign_owner_idx").on(t.ownerId),
  ],
);

export const boostCampaignCreative = pgTable(
  "boost_campaign_creative",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    state: boostCreativeStateEnum("state").notNull().default("draft"),
    headline: text("headline").notNull(),
    description: text("description").notNull(),
    ctaLabel: text("cta_label").notNull(),
    destinationUrl: text("destination_url").notNull(),
    logoUrl: text("logo_url"),
    moderationReason: text("moderation_reason"),
    approvedByUserId: text("approved_by_user_id").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [unique("boost_creative_campaign_version_unique").on(t.campaignId, t.version), index("boost_creative_campaign_state_idx").on(t.state, t.updatedAt)],
);

export const boostCampaignStateTransition = pgTable(
  "boost_campaign_state_transition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    previousState: boostCampaignStateEnum("previous_state"),
    newState: boostCampaignStateEnum("new_state").notNull(),
    reason: text("reason").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    requestId: text("request_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("boost_state_transition_campaign_time_idx").on(t.campaignId, t.occurredAt), index("boost_state_transition_request_idx").on(t.requestId)],
);

export const boostInventoryWindow = pgTable(
  "boost_inventory_window",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placementKey: text("placement_key").notNull(),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    estimatedOpportunities: integer("estimated_opportunities").notNull().default(0),
    estimatedQualifiedImpressions: integer("estimated_qualified_impressions").notNull().default(0),
    reservedImpressions: integer("reserved_impressions").notNull().default(0),
    safeCapacity: integer("safe_capacity").notNull().default(0),
    confidence: text("confidence").notNull().default("unknown"),
    generatedAt: timestamp("generated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    ...timestamps,
  },
  (t) => [index("boost_inventory_window_lookup_idx").on(t.placementKey, t.categoryId, t.startsAt, t.endsAt)],
);

export const boostInventoryReservation = pgTable(
  "boost_inventory_reservation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    windowId: uuid("window_id").references(() => boostInventoryWindow.id, { onDelete: "set null" }),
    placementKey: text("placement_key").notNull(),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    reservedImpressions: integer("reserved_impressions").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    status: boostReservationStatusEnum("status").notNull().default("held"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    createdAt: timestamps.createdAt,
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("boost_reservation_window_idx").on(t.placementKey, t.categoryId, t.startsAt, t.endsAt, t.status), index("boost_reservation_campaign_idx").on(t.campaignId, t.status)],
);

export const boostOrder = pgTable(
  "boost_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }).unique(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    packageKey: text("package_key").notNull(),
    packageSnapshot: jsonb("package_snapshot").$type<Record<string, unknown>>().notNull(),
    currency: text("currency").notNull(),
    expectedAmountCents: integer("expected_amount_cents").notNull(),
    paidAmountCents: integer("paid_amount_cents").notNull().default(0),
    refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
    stripeEnvironment: stripeEnvironmentEnum("stripe_environment").notNull().default("test"),
    paymentStatus: boostPaymentStatusEnum("payment_status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    refundedAt: timestamp("refunded_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [index("boost_order_user_idx").on(t.userId, t.createdAt), index("boost_order_payment_status_idx").on(t.paymentStatus, t.updatedAt)],
);

export const stripeCustomer = pgTable(
  "stripe_customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeEnvironment: stripeEnvironmentEnum("stripe_environment").notNull(),
    ...timestamps,
  },
  (t) => [unique("stripe_customer_user_environment_unique").on(t.userId, t.stripeEnvironment), unique("stripe_customer_provider_id_unique").on(t.stripeEnvironment, t.stripeCustomerId)],
);

export const boostStripeCheckoutSession = pgTable(
  "boost_stripe_checkout_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => boostOrder.id, { onDelete: "cascade" }).unique(),
    stripeSessionId: text("stripe_session_id").notNull(),
    stripeEnvironment: stripeEnvironmentEnum("stripe_environment").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    paymentIntentId: text("payment_intent_id"),
    status: text("status").notNull().default("open"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [unique("boost_checkout_session_environment_id_unique").on(t.stripeEnvironment, t.stripeSessionId), unique("boost_checkout_session_idempotency_unique").on(t.stripeEnvironment, t.idempotencyKey)],
);

export const boostPayment = pgTable(
  "boost_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => boostOrder.id, { onDelete: "cascade" }),
    stripeEnvironment: stripeEnvironmentEnum("stripe_environment").notNull(),
    status: boostPaymentStatusEnum("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    createdAt: timestamps.createdAt,
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamps.updatedAt,
  },
  (t) => [unique("boost_payment_environment_intent_unique").on(t.stripeEnvironment, t.stripePaymentIntentId), index("boost_payment_order_idx").on(t.orderId, t.createdAt)],
);

export const boostPaymentAttempt = pgTable(
  "boost_payment_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => boostOrder.id, { onDelete: "cascade" }),
    stripeEnvironment: stripeEnvironmentEnum("stripe_environment").notNull(),
    checkoutSessionId: text("checkout_session_id"),
    paymentIntentId: text("payment_intent_id"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("pending"),
    errorCode: text("error_code"),
    requestId: text("request_id"),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [index("boost_payment_attempt_order_idx").on(t.orderId, t.createdAt), unique("boost_payment_attempt_environment_session_unique").on(t.stripeEnvironment, t.checkoutSessionId)],
);

export const boostRefund = pgTable(
  "boost_refund",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => boostOrder.id, { onDelete: "cascade" }),
    stripeEnvironment: stripeEnvironmentEnum("stripe_environment").notNull(),
    stripeRefundId: text("stripe_refund_id"),
    amountCents: integer("amount_cents").notNull(),
    status: boostRefundStatusEnum("status").notNull().default("requested"),
    reason: text("reason").notNull(),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, { onDelete: "set null" }),
    approvedByUserId: text("approved_by_user_id").references(() => user.id, { onDelete: "set null" }),
    requestId: text("request_id").notNull(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [unique("boost_refund_environment_provider_id_unique").on(t.stripeEnvironment, t.stripeRefundId), index("boost_refund_order_idx").on(t.orderId, t.createdAt)],
);

export const boostDispute = pgTable(
  "boost_dispute",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id").references(() => boostPayment.id, { onDelete: "set null" }),
    orderId: uuid("order_id").notNull().references(() => boostOrder.id, { onDelete: "cascade" }),
    stripeEnvironment: stripeEnvironmentEnum("stripe_environment").notNull(),
    stripeDisputeId: text("stripe_dispute_id").notNull(),
    status: boostDisputeStatusEnum("status").notNull().default("open"),
    reason: text("reason"),
    evidenceSnapshot: jsonb("evidence_snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [unique("boost_dispute_environment_provider_id_unique").on(t.stripeEnvironment, t.stripeDisputeId), index("boost_dispute_status_idx").on(t.status, t.createdAt)],
);

export const boostImpression = pgTable(
  "boost_impression",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => boostCampaign.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    placement: boostPlacementEnum("placement").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    qualified: boolean("qualified").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("boost_impression_campaign_idx").on(t.campaignId, t.occurredAt),
    index("boost_impression_dedupe_idx").on(t.campaignId, t.visitorHash, t.occurredAt),
  ],
);

/** Signed opportunity ledger. A rendered card is not billable until qualified. */
export const boostImpressionOpportunity = pgTable(
  "boost_impression_opportunity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    placementKey: text("placement_key").notNull(),
    creativeVersion: integer("creative_version").notNull(),
    visitorContextHash: text("visitor_context_hash").notNull(),
    routeContext: text("route_context"),
    tokenHash: text("token_hash").notNull().unique(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("boost_opportunity_campaign_idx").on(t.campaignId, t.issuedAt), index("boost_opportunity_expiry_idx").on(t.expiresAt, t.usedAt)],
);

export const boostImpressionEvent = pgTable(
  "boost_impression_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull().unique(),
    opportunityId: uuid("opportunity_id").references(() => boostImpressionOpportunity.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    visitorHash: text("visitor_hash").notNull(),
    classification: boostImpressionClassificationEnum("classification").notNull(),
    visiblePercent: integer("visible_percent"),
    visibleMilliseconds: integer("visible_milliseconds"),
    userAgentClass: text("user_agent_class"),
    reasonCode: text("reason_code"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [index("boost_impression_event_campaign_time_idx").on(t.campaignId, t.occurredAt), index("boost_impression_event_visitor_idx").on(t.campaignId, t.visitorHash, t.occurredAt)],
);

export const boostImpressionAggregate = pgTable(
  "boost_impression_aggregate",
  {
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true, mode: "date" }).notNull(),
    opportunities: integer("opportunities").notNull().default(0),
    renderedImpressions: integer("rendered_impressions").notNull().default(0),
    qualifiedImpressions: integer("qualified_impressions").notNull().default(0),
    invalidImpressions: integer("invalid_impressions").notNull().default(0),
    suspectedImpressions: integer("suspected_impressions").notNull().default(0),
    duplicateImpressions: integer("duplicate_impressions").notNull().default(0),
    updatedAt: timestamps.updatedAt,
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.bucketStart] }), index("boost_impression_aggregate_time_idx").on(t.bucketStart)],
);

export const boostClickEvent = pgTable(
  "boost_click_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    impressionOpportunityId: uuid("impression_opportunity_id").references(() => boostImpressionOpportunity.id, { onDelete: "set null" }),
    visitorHash: text("visitor_hash").notNull(),
    destinationUrl: text("destination_url").notNull(),
    valid: boolean("valid").notNull().default(false),
    uniqueClick: boolean("unique_click").notNull().default(false),
    decision: fraudDecisionEnum("decision").notNull().default("valid"),
    referrerPath: text("referrer_path"),
    creativeVersion: integer("creative_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [index("boost_click_campaign_time_idx").on(t.campaignId, t.occurredAt), index("boost_click_visitor_time_idx").on(t.campaignId, t.visitorHash, t.occurredAt)],
);

export const boostAttributionAggregate = pgTable(
  "boost_attribution_aggregate",
  {
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => site.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    attributedVisits: integer("attributed_visits").notNull().default(0),
    attributedEngagedVisits: integer("attributed_engaged_visits").notNull().default(0),
    updatedAt: timestamps.updatedAt,
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.day] }), index("boost_attribution_site_day_idx").on(t.siteId, t.day)],
);

export const boostFrequencyCap = pgTable(
  "boost_frequency_cap",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    visitorHash: text("visitor_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    exposureCount: integer("exposure_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [unique("boost_frequency_campaign_visitor_window_unique").on(t.campaignId, t.visitorHash, t.windowStart), index("boost_frequency_expiry_idx").on(t.expiresAt)],
);

export const boostDeliveryJob = pgTable(
  "boost_delivery_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => boostCampaign.id, { onDelete: "cascade" }),
    jobKey: text("job_key").notNull(),
    jobType: text("job_type").notNull(),
    status: text("status").notNull().default("queued"),
    expectedProgress: numeric("expected_progress", { precision: 6, scale: 4 }),
    actualProgress: numeric("actual_progress", { precision: 6, scale: 4 }),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    errorCode: text("error_code"),
    requestId: text("request_id"),
    ...timestamps,
  },
  (t) => [unique("boost_delivery_job_key_unique").on(t.campaignId, t.jobKey), index("boost_delivery_job_status_idx").on(t.status, t.updatedAt)],
);

export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boostCampaignId: uuid("boost_campaign_id").references(() => boostCampaign.id, {
      onDelete: "set null",
    }),
    provider: paymentProviderEnum("provider").notNull(),
    providerReference: text("provider_reference").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [uniqueIndex("payment_provider_ref_unique").on(t.provider, t.providerReference)],
);

/** Idempotency ledger for webhooks. */
export const processedWebhookEvent = pgTable(
  "processed_webhook_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: paymentProviderEnum("provider").notNull(),
    eventId: text("event_id").notNull(),
    stripeEnvironment: stripeEnvironmentEnum("stripe_environment").notNull().default("test"),
    eventType: text("event_type"),
    requestId: text("request_id"),
    processingResult: text("processing_result"),
    errorCode: text("error_code"),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("processed_webhook_unique").on(t.provider, t.stripeEnvironment, t.eventId)],
);

export const subscription = pgTable("subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: paymentProviderEnum("provider").notNull(),
  externalId: text("external_id").notNull().unique(),
  status: text("status").notNull().default("inactive"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: "date" }),
  ...timestamps,
});

/* ─────────────────────────── Moderation ─────────────────────────── */

export const fraudFlag = pgTable(
  "fraud_flag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").references(() => site.id, { onDelete: "cascade" }),
    subjectType: fraudSubjectEnum("subject_type").notNull(),
    subjectRef: text("subject_ref").notNull(),
    signals: jsonb("signals").$type<string[]>().notNull(),
    score: integer("score").notNull().default(0),
    decision: fraudDecisionEnum("decision").notNull(),
    ruleVersion: text("rule_version").notNull(),
    note: text("note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("fraud_flag_site_idx").on(t.siteId),
    index("fraud_flag_open_idx").on(t.resolvedAt, t.createdAt),
  ],
);

export const moderationAction = pgTable(
  "moderation_action",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    previousState: jsonb("previous_state").$type<Record<string, unknown>>(),
    newState: jsonb("new_state").$type<Record<string, unknown>>(),
    reason: text("reason"),
    requestId: text("request_id").notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("moderation_action_target_idx").on(t.targetType, t.targetId),
    index("moderation_action_request_idx").on(t.requestId),
  ],
);

export const blockedDomain = pgTable("blocked_domain", {
  domain: text("domain").primaryKey(),
  reason: text("reason").notNull().default(""),
  blockedByUserId: text("blocked_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamps.createdAt,
});

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    previousState: jsonb("previous_state").$type<Record<string, unknown>>(),
    newState: jsonb("new_state").$type<Record<string, unknown>>(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    reason: text("reason"),
    requestId: text("request_id").notNull(),
    actorIpHash: text("actor_ip_hash"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("admin_audit_time_idx").on(t.createdAt),
    index("admin_audit_request_idx").on(t.requestId),
  ],
);

/* ─────────────────── Raw tracker events (demo analytics) ─────────────────── */

export const trackerEvent = pgTable(
  "tracker_event",
  {
    eventId: text("event_id").primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    sessionId: text("session_id").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    pathname: text("pathname").notNull().default("/"),
    referrerHost: text("referrer_host"),
    country: text("country"),
    device: text("device"),
    /** Public tracker key used for current-key connection and installation tests. */
    trackerPublicKey: text("tracker_public_key"),
    visible: boolean("visible").notNull().default(true),
    engagedSeconds: integer("engaged_seconds"),
    trackerVersion: text("tracker_version").notNull().default("1.0.0"),
    attributionTokenHash: text("attribution_token_hash"),
    trafficOrigin: text("traffic_origin").notNull().default("direct"),
    attributionCampaignId: uuid("attribution_campaign_id").references(() => boostCampaign.id, { onDelete: "set null" }),
    originHost: text("origin_host"),
    fraudScore: integer("fraud_score").notNull().default(0),
    fraudRuleVersion: text("fraud_rule_version").notNull().default("v1"),
    collectorRequestId: text("collector_request_id"),
    decision: fraudDecisionEnum("decision").notNull().default("valid"),
    reasons: jsonb("reasons").$type<string[]>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    index("tracker_event_site_time_idx").on(t.siteId, t.occurredAt),
    index("tracker_event_type_time_idx").on(t.eventType, t.occurredAt),
    index("tracker_event_session_idx").on(t.sessionId),
    index("tracker_event_attribution_idx").on(t.attributionTokenHash),
    index("tracker_event_decision_time_idx").on(t.decision, t.occurredAt),
  ],
);

/** One-time linkage between a signed SurgeIndex click and a landing event. */
export const attributionRecord = pgTable(
  "attribution_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    outboundClickId: uuid("outbound_click_id").references(() => outboundClick.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => boostCampaign.id, { onDelete: "set null" }),
    trafficOrigin: text("traffic_origin").notNull().default("organic_surgedindex_referral"),
    tokenHash: text("token_hash").notNull().unique(),
    visitorHash: text("visitor_hash").notNull(),
    sessionHash: text("session_hash").notNull(),
    landingEventId: text("landing_event_id").notNull().unique(),
    createdAt: timestamps.createdAt,
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    engagedAt: timestamp("engaged_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("attribution_site_time_idx").on(t.siteId, t.createdAt), index("attribution_session_idx").on(t.sessionHash)],
);

/** Structured failures are operational evidence, not public event payloads. */
export const ingestionFailure = pgTable(
  "ingestion_failure",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").references(() => site.id, { onDelete: "set null" }),
    eventId: text("event_id"),
    requestId: text("request_id").notNull(),
    stage: text("stage").notNull(),
    code: text("code").notNull(),
    detail: text("detail"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("ingestion_failure_time_idx").on(t.createdAt), index("ingestion_failure_site_idx").on(t.siteId)],
);

/** Idempotent cron/aggregation checkpoint. */
export const aggregationJobState = pgTable("aggregation_job_state", {
  jobKey: text("job_key").primaryKey(),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true, mode: "date" }),
  lastCompletedAt: timestamp("last_completed_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** Live session registry derived from heartbeats. */
export const activeSession = pgTable(
  "active_session",
  {
    sessionId: text("session_id").primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    visitorHash: text("visitor_hash").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    hidden: boolean("hidden").notNull().default(false),
    lastEventAt: timestamp("last_event_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("active_session_site_idx").on(t.siteId, t.lastHeartbeatAt)],
);

/* ─────────────────────── Waitlist (future modules) ─────────────────────── */

export const waitlistEntry = pgTable(
  "waitlist_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: text("topic").notNull(),
    email: text("email").notNull(),
    consent: boolean("consent").notNull().default(false),
    createdAt: timestamps.createdAt,
  },
  (t) => [unique("waitlist_topic_email_unique").on(t.topic, t.email)],
);

export const schemaSqlHelpers = { sql };
