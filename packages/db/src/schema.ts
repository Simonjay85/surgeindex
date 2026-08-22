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
export const trackerKeyStatusEnum = pgEnum("tracker_key_status", ["active", "rotated", "revoked"]);
export const snapshotGranularityEnum = pgEnum("snapshot_granularity", ["hour", "day"]);
export const rankWindowEnum = pgEnum("rank_window", ["live", "24h", "7d"]);
export const activityTypeEnum = pgEnum("activity_type", [
  "site_submitted",
  "site_verified",
  "entered_top_10",
  "rank_up",
  "surging",
  "boost_started",
  "boost_completed",
  "badge_earned",
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
export const ownerRoleEnum = pgEnum("owner_role", ["owner", "editor"]);

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
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("site_claim_site_idx").on(t.siteId, t.status)],
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
    status: trackerKeyStatusEnum("status").notNull().default("active"),
    createdAt: timestamps.createdAt,
    lastEventAt: timestamp("last_event_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("tracker_key_site_idx").on(t.siteId)],
);

export const gaConnection = pgTable("ga_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => site.id, { onDelete: "cascade" })
    .unique(),
  propertyId: text("property_id").notNull(),
  propertyName: text("property_name"),
  /** Encrypted at rest with OAUTH_TOKEN_ENCRYPTION_KEY. */
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  status: gaStatusEnum("status").notNull().default("active"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: "date" }),
  lastError: text("last_error"),
  ...timestamps,
});

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
    engagementRate: numeric("engagement_rate", { precision: 5, scale: 4 }),
    avgEngagementSeconds: integer("avg_engagement_seconds"),
    baselineDailyVisitors: bigint("baseline_daily_visitors", { mode: "number" }),
    typicalActiveNow: integer("typical_active_now"),
    growth24hPct: numeric("growth_24h_pct", { precision: 8, scale: 2 }),
    growth7dPct: numeric("growth_7d_pct", { precision: 8, scale: 2 }),
    surgeReferrals24h: integer("surge_referrals_24h").notNull().default(0),
    heatScore: integer("heat_score").notNull().default(0),
    heatLeague: text("heat_league").notNull().default("new"),
    scoreVersion: text("score_version").notNull().default("v1"),
    fraudPenalty: numeric("fraud_penalty", { precision: 4, scale: 3 }).notNull().default("0"),
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
    activeNow: integer("active_now").notNull().default(0),
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
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("rank_snapshot_scope_time_idx").on(t.scope, t.window, t.capturedAt)],
);

export const scoreVersion = pgTable("score_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull().unique(),
  description: text("description").notNull().default(""),
  weights: jsonb("weights").$type<Record<string, number>>().notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(false),
});

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
    placement: boostPlacementEnum("placement").notNull(),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    headline: text("headline").notNull().default(""),
    budgetCents: integer("budget_cents").notNull().default(0),
    spendCents: integer("spend_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    targetImpressions: integer("target_impressions").notNull().default(0),
    deliveredImpressions: integer("delivered_impressions").notNull().default(0),
    validImpressions: integer("valid_impressions").notNull().default(0),
    validClicks: integer("valid_clicks").notNull().default(0),
    uniqueClicks: integer("unique_clicks").notNull().default(0),
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
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("processed_webhook_unique").on(t.provider, t.eventId)],
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
    reason: text("reason"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("moderation_action_target_idx").on(t.targetType, t.targetId)],
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
    details: jsonb("details").$type<Record<string, unknown>>(),
    actorIpHash: text("actor_ip_hash"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("admin_audit_time_idx").on(t.createdAt)],
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
  ],
);

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
