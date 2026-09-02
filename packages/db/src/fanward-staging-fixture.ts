import { createHash } from "node:crypto";
import { Client } from "pg";

export const FANWARD_FIXTURE_STAGING_ORIGIN = "https://staging.surgeindex.lol";
export const FANWARD_FIXTURE_CONFIRMATION = "staging.surgeindex.lol";
export const FANWARD_FIXTURE_DATABASE = "surgeindex_staging";
export const FANWARD_FIXTURE_DATABASE_PORT = "55434";
export const FANWARD_FIXTURE_MIGRATION_COUNT = 15;

export type FanwardFixtureCommand = "create" | "status" | "cleanup" | "revoke-sessions";
export type FanwardFixtureRateLimitPhase = "preflight" | "active" | "complete" | "recovery";

export interface FanwardFixtureIdentity {
  marker: string;
  siteSlug: string;
  siteDomain: string;
  siteName: string;
  siteDescription: string;
  ownerUserId: string;
  adminUserId: string;
  ownerAccountId: string;
  adminAccountId: string;
  ownerEmail: string;
  adminEmail: string;
  ownerName: string;
  adminName: string;
}

export interface FanwardFixtureContext {
  origin: typeof FANWARD_FIXTURE_STAGING_ORIGIN;
  runId: string;
  releaseSha: string;
  httpsClientIp: string;
  categorySlug: string;
  identity: FanwardFixtureIdentity;
}

export interface FanwardFixtureSecrets {
  ownerPassword: string;
  adminPassword: string;
  authSecret: string;
}

export interface FanwardFixtureTableMutation {
  inserted: number;
  updated: number;
  deleted: number;
}

export type FanwardFixtureMutationInventory = Record<string, FanwardFixtureTableMutation>;

/**
 * Reviewed migration-15 FK graph reachable from public.site/public.user by
 * cascading deletes. Each edge also records non-cascade actions that can be
 * triggered when a reachable parent disappears. PostgreSQL action codes are:
 * a=no action, r=restrict, c=cascade, n=set null, d=set default.
 */
export const FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES = Object.freeze(`account_user_id_user_id_fk|public.account(user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
active_session_site_id_site_id_fk|public.active_session(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
activity_event_site_id_site_id_fk|public.activity_event(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
admin_audit_log_actor_user_id_user_id_fk|public.admin_audit_log(actor_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
attribution_record_campaign_id_boost_campaign_id_fk|public.attribution_record(campaign_id)>public.boost_campaign(id)|d=n|u=a|v=1|f=0|i=0
attribution_record_outbound_click_id_outbound_click_id_fk|public.attribution_record(outbound_click_id)>public.outbound_click(id)|d=n|u=a|v=1|f=0|i=0
attribution_record_site_id_site_id_fk|public.attribution_record(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
baseline_bucket_site_id_site_id_fk|public.baseline_bucket(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
blocked_domain_blocked_by_user_id_user_id_fk|public.blocked_domain(blocked_by_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
boost_attribution_aggregate_campaign_id_boost_campaign_id_fk|public.boost_attribution_aggregate(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_attribution_aggregate_site_id_site_id_fk|public.boost_attribution_aggregate(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
boost_campaign_creative_approved_by_user_id_user_id_fk|public.boost_campaign_creative(approved_by_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
boost_campaign_creative_campaign_id_boost_campaign_id_fk|public.boost_campaign_creative(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_campaign_owner_id_user_id_fk|public.boost_campaign(owner_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
boost_campaign_site_id_site_id_fk|public.boost_campaign(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
boost_campaign_state_transition_actor_user_id_user_id_fk|public.boost_campaign_state_transition(actor_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
boost_campaign_state_transition_campaign_id_boost_campaign_id_fk|public.boost_campaign_state_transition(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_click_event_campaign_id_boost_campaign_id_fk|public.boost_click_event(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_click_event_impression_opportunity_id_boost_impression_opportunity_id_fk|public.boost_click_event(impression_opportunity_id)>public.boost_impression_opportunity(id)|d=n|u=a|v=1|f=0|i=0
boost_click_event_site_id_site_id_fk|public.boost_click_event(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
boost_delivery_job_campaign_id_boost_campaign_id_fk|public.boost_delivery_job(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_dispute_order_id_boost_order_id_fk|public.boost_dispute(order_id)>public.boost_order(id)|d=c|u=a|v=1|f=0|i=0
boost_dispute_payment_id_boost_payment_id_fk|public.boost_dispute(payment_id)>public.boost_payment(id)|d=n|u=a|v=1|f=0|i=0
boost_frequency_cap_campaign_id_boost_campaign_id_fk|public.boost_frequency_cap(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_impression_aggregate_campaign_id_boost_campaign_id_fk|public.boost_impression_aggregate(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_impression_campaign_id_boost_campaign_id_fk|public.boost_impression(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_impression_event_campaign_id_boost_campaign_id_fk|public.boost_impression_event(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_impression_event_opportunity_id_boost_impression_opportunity_id_fk|public.boost_impression_event(opportunity_id)>public.boost_impression_opportunity(id)|d=n|u=a|v=1|f=0|i=0
boost_impression_event_site_id_site_id_fk|public.boost_impression_event(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
boost_impression_opportunity_campaign_id_boost_campaign_id_fk|public.boost_impression_opportunity(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_impression_site_id_site_id_fk|public.boost_impression(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
boost_inventory_reservation_campaign_id_boost_campaign_id_fk|public.boost_inventory_reservation(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_order_campaign_id_boost_campaign_id_fk|public.boost_order(campaign_id)>public.boost_campaign(id)|d=c|u=a|v=1|f=0|i=0
boost_order_user_id_user_id_fk|public.boost_order(user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
boost_payment_attempt_order_id_boost_order_id_fk|public.boost_payment_attempt(order_id)>public.boost_order(id)|d=c|u=a|v=1|f=0|i=0
boost_payment_order_id_boost_order_id_fk|public.boost_payment(order_id)>public.boost_order(id)|d=c|u=a|v=1|f=0|i=0
boost_refund_approved_by_user_id_user_id_fk|public.boost_refund(approved_by_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
boost_refund_order_id_boost_order_id_fk|public.boost_refund(order_id)>public.boost_order(id)|d=c|u=a|v=1|f=0|i=0
boost_refund_requested_by_user_id_user_id_fk|public.boost_refund(requested_by_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
boost_stripe_checkout_session_order_id_boost_order_id_fk|public.boost_stripe_checkout_session(order_id)>public.boost_order(id)|d=c|u=a|v=1|f=0|i=0
breakout_event_site_id_site_id_fk|public.breakout_event(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
breakout_state_transition_breakout_event_id_breakout_event_id_fk|public.breakout_state_transition(breakout_event_id)>public.breakout_event(id)|d=c|u=a|v=1|f=0|i=0
creator_profile_owner_user_id_user_id_fk|public.creator_profile(owner_user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
creator_profile_primary_site_id_site_id_fk|public.creator_profile(primary_site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
creator_profile_revision_created_by_user_id_user_id_fk|public.creator_profile_revision(created_by_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
creator_profile_revision_creator_profile_id_creator_profile_id_fk|public.creator_profile_revision(creator_profile_id)>public.creator_profile(id)|d=c|u=a|v=1|f=0|i=0
creator_profile_revision_reviewed_by_user_id_user_id_fk|public.creator_profile_revision(reviewed_by_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
current_ranking_score_id_site_score_id_fk|public.current_ranking(score_id)>public.site_score(id)|d=n|u=a|v=1|f=0|i=0
current_ranking_site_id_site_id_fk|public.current_ranking(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
fraud_flag_resolved_by_user_id_user_id_fk|public.fraud_flag(resolved_by_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
fraud_flag_site_id_site_id_fk|public.fraud_flag(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
ga_account_connection_id_ga_connection_id_fk|public.ga_account(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_backfill_job_connection_id_ga_connection_id_fk|public.ga_backfill_job(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_connection_site_id_site_id_fk|public.ga_connection(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
ga_connection_user_id_user_id_fk|public.ga_connection(user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
ga_credential_connection_id_ga_connection_id_fk|public.ga_credential(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_data_stream_property_id_ga_property_id_fk|public.ga_data_stream(property_id)>public.ga_property(id)|d=c|u=a|v=1|f=0|i=0
ga_metric_aggregate_connection_id_ga_connection_id_fk|public.ga_metric_aggregate(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_metric_aggregate_site_id_site_id_fk|public.ga_metric_aggregate(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
ga_oauth_transaction_site_id_site_id_fk|public.ga_oauth_transaction(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
ga_oauth_transaction_user_id_user_id_fk|public.ga_oauth_transaction(user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
ga_property_account_id_ga_account_id_fk|public.ga_property(account_id)>public.ga_account(id)|d=n|u=a|v=1|f=0|i=0
ga_property_capability_property_id_ga_property_id_fk|public.ga_property_capability(property_id)>public.ga_property(id)|d=c|u=a|v=1|f=0|i=0
ga_property_connection_id_ga_connection_id_fk|public.ga_property(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_quota_snapshot_connection_id_ga_connection_id_fk|public.ga_quota_snapshot(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_realtime_snapshot_connection_id_ga_connection_id_fk|public.ga_realtime_snapshot(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_realtime_snapshot_site_id_site_id_fk|public.ga_realtime_snapshot(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
ga_report_snapshot_connection_id_ga_connection_id_fk|public.ga_report_snapshot(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_sync_job_connection_id_ga_connection_id_fk|public.ga_sync_job(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_sync_run_connection_id_ga_connection_id_fk|public.ga_sync_run(connection_id)>public.ga_connection(id)|d=c|u=a|v=1|f=0|i=0
ga_sync_run_job_id_ga_sync_job_id_fk|public.ga_sync_run(job_id)>public.ga_sync_job(id)|d=n|u=a|v=1|f=0|i=0
ingestion_failure_site_id_site_id_fk|public.ingestion_failure(site_id)>public.site(id)|d=n|u=a|v=1|f=0|i=0
moderation_action_actor_user_id_user_id_fk|public.moderation_action(actor_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
outbound_click_aggregate_site_id_site_id_fk|public.outbound_click_aggregate(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
outbound_click_site_id_site_id_fk|public.outbound_click(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
payment_boost_campaign_id_boost_campaign_id_fk|public.payment(boost_campaign_id)>public.boost_campaign(id)|d=n|u=a|v=1|f=0|i=0
rank_snapshot_site_id_site_id_fk|public.rank_snapshot(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
session_user_id_user_id_fk|public.session(user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
site_baseline_site_id_site_id_fk|public.site_baseline(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_category_site_id_site_id_fk|public.site_category(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_claim_site_id_site_id_fk|public.site_claim(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_claim_user_id_user_id_fk|public.site_claim(user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
site_metric_current_site_id_site_id_fk|public.site_metric_current(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_metric_snapshot_site_id_site_id_fk|public.site_metric_snapshot(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_metric_source_policy_site_id_site_id_fk|public.site_metric_source_policy(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_metric_source_transition_actor_user_id_user_id_fk|public.site_metric_source_transition(actor_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
site_metric_source_transition_site_id_site_id_fk|public.site_metric_source_transition(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_owner_site_id_site_id_fk|public.site_owner(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_owner_user_id_user_id_fk|public.site_owner(user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
site_page_metric_current_site_id_site_id_fk|public.site_page_metric_current(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_revenue_current_site_id_site_id_fk|public.site_revenue_current(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_score_baseline_site_id_site_baseline_site_id_fk|public.site_score(baseline_site_id)>public.site_baseline(site_id)|d=n|u=a|v=1|f=0|i=0
site_score_component_score_id_site_score_id_fk|public.site_score_component(score_id)>public.site_score(id)|d=c|u=a|v=1|f=0|i=0
site_score_site_id_site_id_fk|public.site_score(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_submitted_by_user_id_user_id_fk|public.site(submitted_by_user_id)>public.user(id)|d=n|u=a|v=1|f=0|i=0
site_tag_site_id_site_id_fk|public.site_tag(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
site_verification_site_id_site_id_fk|public.site_verification(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
stripe_customer_user_id_user_id_fk|public.stripe_customer(user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
subscription_user_id_user_id_fk|public.subscription(user_id)>public.user(id)|d=c|u=a|v=1|f=0|i=0
tracker_event_attribution_campaign_id_boost_campaign_id_fk|public.tracker_event(attribution_campaign_id)>public.boost_campaign(id)|d=n|u=a|v=1|f=0|i=0
tracker_event_site_id_site_id_fk|public.tracker_event(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0
tracker_key_site_id_site_id_fk|public.tracker_key(site_id)>public.site(id)|d=c|u=a|v=1|f=0|i=0`.split("\n"));

export interface FanwardFixtureDirectReference {
  constraint: string;
  childTable: string;
  childColumns: readonly string[];
  parentTable: "public.site" | "public.user";
  parentColumns: readonly string[];
}

/**
 * These direct references are validated through stronger exact fixture
 * invariants instead of being categorically forbidden by the status inventory.
 * The two creator-profile-revision actor constraints additionally receive a
 * scoped residue query in the runtime tool.
 */
export const FANWARD_FIXTURE_ALLOWED_DIRECT_FK_CONSTRAINTS = Object.freeze([
  "account_user_id_user_id_fk",
  "admin_audit_log_actor_user_id_user_id_fk",
  "creator_profile_owner_user_id_user_id_fk",
  "creator_profile_primary_site_id_site_id_fk",
  "creator_profile_revision_created_by_user_id_user_id_fk",
  "creator_profile_revision_reviewed_by_user_id_user_id_fk",
  "moderation_action_actor_user_id_user_id_fk",
  "session_user_id_user_id_fk",
  "site_submitted_by_user_id_user_id_fk",
  "site_owner_site_id_site_id_fk",
  "site_owner_user_id_user_id_fk",
  "site_verification_site_id_site_id_fk",
] as const);

function parseSchema15DirectReferences(): FanwardFixtureDirectReference[] {
  return FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES.flatMap((signature) => {
    const match = /^([^|]+)\|([^()]+)\(([^)]*)\)>([^()]+)\(([^)]*)\)\|/.exec(signature);
    if (!match || (match[4] !== "public.site" && match[4] !== "public.user")) return [];
    return [{
      constraint: match[1]!,
      childTable: match[2]!,
      childColumns: Object.freeze(match[3]!.split(",").filter(Boolean)),
      parentTable: match[4],
      parentColumns: Object.freeze(match[5]!.split(",").filter(Boolean)),
    }];
  });
}

export const FANWARD_FIXTURE_SCHEMA_15_DIRECT_REFERENCES = Object.freeze(
  parseSchema15DirectReferences().map((reference) => Object.freeze(reference)),
);

const allowedDirectConstraints = new Set<string>(FANWARD_FIXTURE_ALLOWED_DIRECT_FK_CONSTRAINTS);
export const FANWARD_FIXTURE_SCHEMA_15_FORBIDDEN_DIRECT_TABLES = Object.freeze([
  ...new Set(
    FANWARD_FIXTURE_SCHEMA_15_DIRECT_REFERENCES
      .filter((reference) => !allowedDirectConstraints.has(reference.constraint))
      .map((reference) => reference.childTable),
  ),
].sort());

export interface FanwardFixtureIds {
  siteId: string;
  siteOwnerId: string;
  categoryId: string;
  ownerUserId: string;
  adminUserId: string;
  ownerAccountId: string;
  adminAccountId: string;
}

export interface FanwardFixturePrincipalSnapshot {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: "user" | "admin";
  isDemo: boolean;
  sessionCount: number;
  accountCount: number;
  account: {
    id: string;
    accountId: string;
    providerId: string;
    issuer: string;
    hasPassword: boolean;
    passwordMatches: boolean;
    hasOAuthMaterial: boolean;
  } | null;
}

export interface FanwardFixtureSnapshot {
  site: {
    id: string;
    slug: string;
    domain: string;
    name: string;
    description: string;
    categoryId: string | null;
    status: string;
    verification: string;
    ownership: string;
    submittedByUserId: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
    ogImageUrl: string | null;
    permittedAliases: string[];
    featured: boolean;
    isDemo: boolean;
    publicRevenueVisible: boolean;
    publicPageMetricsVisible: boolean;
    deletedAt: Date | null;
  } | null;
  identityCollisionIds: string[];
  category: { id: string; slug: string } | null;
  owner: FanwardFixturePrincipalSnapshot | null;
  admin: FanwardFixturePrincipalSnapshot | null;
  memberships: Array<{ id: string; siteId: string; userId: string; role: string }>;
  otherFixtureUserMembershipCount: number;
  otherFixtureUserSubmittedSiteCount: number;
  verification: {
    siteId: string;
    source: string;
    method: string | null;
    status: string;
    verifiedAt: Date | null;
    lastSyncAt: Date | null;
    lastError: string | null;
    evidence: Record<string, unknown> | null;
  } | null;
  profiles: Array<{ id: string; ownerUserId: string; primarySiteId: string }>;
  revisionIds: string[];
  forbiddenCounts: Record<string, number>;
  unexpectedFixtureAuditCount: number;
  retainedAuditCounts: { moderationActions: number; adminAuditLogs: number };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredSecret(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertExact(env: NodeJS.ProcessEnv, name: string, expected: string): void {
  if (required(env, name) !== expected) {
    throw new Error(`${name} must equal the staging-only value.`);
  }
}

function parseDatabaseTarget(raw: string, name: string): { host: string; port: string; database: string } {
  let value: URL;
  try {
    value = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }
  if (value.protocol !== "postgresql:" && value.protocol !== "postgres:") {
    throw new Error(`${name} must use PostgreSQL.`);
  }
  if (raw.includes("?") || raw.includes("#") || value.search || value.hash) {
    throw new Error(`${name} must not contain query parameters or a fragment.`);
  }
  const database = decodeURIComponent(value.pathname.replace(/^\//, ""));
  if (value.hostname !== "127.0.0.1" || value.port !== FANWARD_FIXTURE_DATABASE_PORT || database !== FANWARD_FIXTURE_DATABASE) {
    throw new Error(`${name} must target the exact loopback staging database.`);
  }

  // Use the exact parser used by the installed pg runtime. PostgreSQL URL query
  // parameters can otherwise override the visible authority (for example host
  // or port) even when WHATWG URL validation appears to pass.
  const effective = new Client({ connectionString: raw }) as Client & {
    connectionParameters: {
      host: string;
      port: number;
      database?: string;
      options?: string;
    };
  };
  const effectiveTarget = {
    host: effective.connectionParameters.host,
    port: String(effective.connectionParameters.port),
    database: effective.connectionParameters.database ?? "",
  };
  if (
    effectiveTarget.host !== "127.0.0.1"
    || effectiveTarget.port !== FANWARD_FIXTURE_DATABASE_PORT
    || effectiveTarget.database !== FANWARD_FIXTURE_DATABASE
    || Boolean(effective.connectionParameters.options)
  ) {
    throw new Error(`${name} must resolve through pg to the exact loopback staging database.`);
  }
  return effectiveTarget;
}

export function isFanwardFixtureInternalPostgresEndpoint(address: string, port: number): boolean {
  if (port !== 5432) return false;
  const normalizedAddress = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  if (normalizedAddress === "::1" || normalizedAddress === "127.0.0.1" || normalizedAddress.startsWith("127.")) return true;
  if (normalizedAddress.startsWith("10.") || normalizedAddress.startsWith("192.168.")) return true;
  const private172 = /^172\.(\d{1,2})\./.exec(normalizedAddress);
  if (private172) {
    const secondOctet = Number(private172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }
  return /^(?:fc|fd)[0-9a-f]{2}:/i.test(normalizedAddress);
}

function assertSameDatabaseTarget(
  left: { host: string; port: string; database: string },
  right: { host: string; port: string; database: string },
): void {
  if (left.host !== right.host || left.port !== right.port || left.database !== right.database) {
    throw new Error("DATABASE_URL and DATABASE_URL_UNPOOLED must target the same staging database.");
  }
}

function validateRunId(value: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{6,22}[a-z0-9])$/.test(value)) {
    throw new Error("FANWARD_FIXTURE_RUN_ID must be 8-24 lowercase letters, digits, or internal hyphens.");
  }
  return value;
}

function validateReleaseSha(value: string, currentSha: string): string {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("FANWARD_FIXTURE_RELEASE_SHA must be an exact 40-character lowercase Git SHA.");
  }
  if (value !== currentSha) {
    throw new Error("FANWARD_FIXTURE_RELEASE_SHA must equal the current release checkout SHA.");
  }
  return value;
}

export function deriveFanwardFixtureHttpsClientIp(releaseSha: string): string {
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new Error("A release-scoped fixture client IP requires an exact lowercase Git SHA.");
  }
  const octets = [0, 2, 4].map((offset) => (Number.parseInt(releaseSha.slice(offset, offset + 2), 16) % 254) + 1);
  return `127.${octets.join(".")}`;
}

function validateCategorySlug(value: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(value)) {
    throw new Error("FANWARD_FIXTURE_CATEGORY_SLUG must be an exact lowercase category slug.");
  }
  return value;
}

function validatePassword(value: string, name: string): string {
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(value)) {
    throw new Error(`${name} must be 24-128 URL-safe characters from a root-only environment file.`);
  }
  return value;
}

function validateAuthSecret(value: string): string {
  if (value.length < 32 || value.length > 512) {
    throw new Error("BETTER_AUTH_SECRET must be 32-512 characters for fixture cleanup inventory.");
  }
  return value;
}

export function buildFanwardFixtureIdentity(runId: string, releaseSha: string): FanwardFixtureIdentity {
  const releaseToken = releaseSha.slice(0, 12);
  const shortToken = releaseSha.slice(0, 8);
  const marker = `fanward-staging-fixture:${runId}:${releaseSha}`;
  return {
    marker,
    siteSlug: `fanward-fixture-${runId}-${releaseToken}`,
    siteDomain: `fw-${runId}-${releaseToken}.staging.invalid`,
    siteName: `Fanward staging fixture ${runId}`,
    siteDescription: `[${marker}] Controlled synthetic staging prerequisite. It creates no traffic, score, audience, follower, revenue, conversion, or payment data.`,
    ownerUserId: `fwfx-${runId}-${releaseToken}-owner`,
    adminUserId: `fwfx-${runId}-${releaseToken}-admin`,
    ownerAccountId: `fwfx-${runId}-${releaseToken}-owner-credential`,
    adminAccountId: `fwfx-${runId}-${releaseToken}-admin-credential`,
    ownerEmail: `fanward-owner+${runId}-${shortToken}@staging.invalid`,
    adminEmail: `fanward-admin+${runId}-${shortToken}@staging.invalid`,
    ownerName: `Fanward staging owner ${runId}`,
    adminName: `Fanward staging admin ${runId}`,
  };
}

export function validateFanwardStagingFixtureEnvironment(
  env: NodeJS.ProcessEnv,
  currentSha: string,
): FanwardFixtureContext {
  assertExact(env, "FANWARD_FIXTURE_CONFIRM", FANWARD_FIXTURE_CONFIRMATION);
  assertExact(env, "NEXT_PUBLIC_APP_URL", FANWARD_FIXTURE_STAGING_ORIGIN);
  assertExact(env, "BETTER_AUTH_URL", FANWARD_FIXTURE_STAGING_ORIGIN);
  assertExact(env, "TURNSTILE_EXPECTED_HOSTNAME", FANWARD_FIXTURE_CONFIRMATION);
  assertExact(env, "TURNSTILE_REQUIRED", "true");
  assertExact(env, "APP_MODE", "production");
  assertExact(env, "DATA_PROVIDER", "postgres");
  assertExact(env, "DB_DRIVER", "pg");
  assertExact(env, "FEATURE_CREATORS", "true");
  assertExact(env, "EXPECTED_MIGRATION_COUNT", String(FANWARD_FIXTURE_MIGRATION_COUNT));

  const pooled = parseDatabaseTarget(required(env, "DATABASE_URL"), "DATABASE_URL");
  const unpooledRaw = env.DATABASE_URL_UNPOOLED?.trim();
  if (unpooledRaw) assertSameDatabaseTarget(pooled, parseDatabaseTarget(unpooledRaw, "DATABASE_URL_UNPOOLED"));

  const runId = validateRunId(required(env, "FANWARD_FIXTURE_RUN_ID"));
  const releaseSha = validateReleaseSha(required(env, "FANWARD_FIXTURE_RELEASE_SHA"), currentSha);
  const httpsClientIp = deriveFanwardFixtureHttpsClientIp(releaseSha);
  assertExact(env, "FANWARD_FIXTURE_HTTPS_CLIENT_IP", httpsClientIp);
  const categorySlug = validateCategorySlug(required(env, "FANWARD_FIXTURE_CATEGORY_SLUG"));
  return {
    origin: FANWARD_FIXTURE_STAGING_ORIGIN,
    runId,
    releaseSha,
    httpsClientIp,
    categorySlug,
    identity: buildFanwardFixtureIdentity(runId, releaseSha),
  };
}

export function readFanwardFixtureSecrets(env: NodeJS.ProcessEnv): FanwardFixtureSecrets {
  const ownerPassword = validatePassword(requiredSecret(env, "FANWARD_FIXTURE_OWNER_PASSWORD"), "FANWARD_FIXTURE_OWNER_PASSWORD");
  const adminPassword = validatePassword(requiredSecret(env, "FANWARD_FIXTURE_ADMIN_PASSWORD"), "FANWARD_FIXTURE_ADMIN_PASSWORD");
  if (ownerPassword === adminPassword) throw new Error("Fixture owner and admin passwords must be different.");
  return {
    ownerPassword,
    adminPassword,
    authSecret: validateAuthSecret(requiredSecret(env, "BETTER_AUTH_SECRET")),
  };
}

export function assertFanwardFixtureSessionRevokeConfirmation(
  env: NodeJS.ProcessEnv,
  context: FanwardFixtureContext,
): void {
  if (required(env, "FANWARD_FIXTURE_SESSION_REVOKE_CONFIRM") !== context.identity.marker) {
    throw new Error("FANWARD_FIXTURE_SESSION_REVOKE_CONFIRM must equal the exact release-scoped fixture marker.");
  }
}

function validateUuid(value: string, name: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be an exact UUID.`);
  }
  return value.toLowerCase();
}

export function readFanwardFixtureIds(env: NodeJS.ProcessEnv, context: FanwardFixtureContext): FanwardFixtureIds {
  const ids = {
    siteId: validateUuid(required(env, "FANWARD_FIXTURE_SITE_ID"), "FANWARD_FIXTURE_SITE_ID"),
    siteOwnerId: validateUuid(required(env, "FANWARD_FIXTURE_SITE_OWNER_ID"), "FANWARD_FIXTURE_SITE_OWNER_ID"),
    categoryId: validateUuid(required(env, "FANWARD_FIXTURE_CATEGORY_ID"), "FANWARD_FIXTURE_CATEGORY_ID"),
    ownerUserId: required(env, "FANWARD_FIXTURE_OWNER_USER_ID"),
    adminUserId: required(env, "FANWARD_FIXTURE_ADMIN_USER_ID"),
    ownerAccountId: required(env, "FANWARD_FIXTURE_OWNER_ACCOUNT_ID"),
    adminAccountId: required(env, "FANWARD_FIXTURE_ADMIN_ACCOUNT_ID"),
  };
  if (
    ids.ownerUserId !== context.identity.ownerUserId
    || ids.adminUserId !== context.identity.adminUserId
    || ids.ownerAccountId !== context.identity.ownerAccountId
    || ids.adminAccountId !== context.identity.adminAccountId
  ) {
    throw new Error("Fixture principal IDs must equal the release-scoped deterministic IDs.");
  }
  return ids;
}

export function buildFanwardFixtureEvidence(context: FanwardFixtureContext, ids: FanwardFixtureIds): Record<string, unknown> {
  return {
    fixtureMarker: context.identity.marker,
    fixtureRunId: context.runId,
    releaseSha: context.releaseSha,
    syntheticStagingFixture: true,
    noTrafficOrMetricsCreated: true,
    ownerUserId: ids.ownerUserId,
    adminUserId: ids.adminUserId,
    categoryId: ids.categoryId,
  };
}

export function buildFanwardFixtureRateLimitKeys(
  context: FanwardFixtureContext,
  ids: Pick<FanwardFixtureIds, "ownerUserId" | "adminUserId">,
  authSecret: string,
): string[] {
  const subjects = [
    ["fanward-owner-read", ids.ownerUserId],
    ["fanward-owner-save", ids.ownerUserId],
    ["fanward-owner-submit", ids.ownerUserId],
    ["fanward-admin-read", ids.adminUserId],
    ["fanward-admin-review", ids.adminUserId],
    ["fanward-public-list", context.httpsClientIp],
    ["fanward-public-detail", context.httpsClientIp],
    ["auth-signin", `${context.httpsClientIp}:${context.identity.ownerEmail}`],
    ["auth-signin", `${context.httpsClientIp}:${context.identity.adminEmail}`],
    ["auth-signin", `${context.httpsClientIp}:unknown`],
  ] as const;
  return subjects.map(([scope, subject]) => (
    createHash("sha256").update(`${scope}:${subject}:${authSecret}`).digest("hex")
  ));
}

export function readFanwardFixtureRateLimitPhase(env: NodeJS.ProcessEnv): FanwardFixtureRateLimitPhase {
  const phase = required(env, "FANWARD_FIXTURE_RATE_LIMIT_PHASE");
  if (phase !== "preflight" && phase !== "active" && phase !== "complete" && phase !== "recovery") {
    throw new Error("FANWARD_FIXTURE_RATE_LIMIT_PHASE must be preflight, active, complete, or recovery.");
  }
  return phase;
}

export function findFanwardFixtureRateLimitPhaseDrift(
  allKeys: readonly string[],
  presentKeys: readonly string[],
  phase: FanwardFixtureRateLimitPhase,
): string[] {
  if (allKeys.length !== 10 || new Set(allKeys).size !== allKeys.length) {
    throw new Error("Fixture rate-limit key inventory must contain ten unique keys.");
  }
  if (new Set(presentKeys).size !== presentKeys.length) return ["duplicate_fixture_rate_limit_key"];
  const all = new Set(allKeys);
  if (presentKeys.some((key) => !all.has(key))) return ["unexpected_fixture_rate_limit_key"];
  if (phase === "recovery") return [];
  const expected = new Set(phase === "preflight" ? [] : phase === "active" ? allKeys.slice(0, 9) : allKeys);
  const present = new Set(presentKeys);
  return (
    present.size === expected.size
    && [...present].every((key) => expected.has(key))
  ) ? [] : [`fixture_rate_limit_phase_${phase}`];
}

/** Fail closed before a fixture result can be serialized to stdout or an evidence file. */
export function assertFanwardFixtureOutputSafe(value: unknown, sensitiveValues: string[]): void {
  const serialized = JSON.stringify(value);
  if (sensitiveValues.some((sensitive) => sensitive.length >= 8 && serialized.includes(sensitive))) {
    throw new Error("Fixture output contained sensitive material and was suppressed.");
  }
}

export function findFanwardFixtureForeignKeyGraphDrift(actualSignatures: readonly string[]): string[] {
  const expected = new Set(FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES);
  const actual = new Set(actualSignatures);
  const drift: string[] = [];
  if (actual.size !== actualSignatures.length) drift.push("duplicate_foreign_key_signature");
  for (const signature of FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES) {
    if (!actual.has(signature)) drift.push(`missing_foreign_key:${signature}`);
  }
  for (const signature of [...actual].sort()) {
    if (!expected.has(signature)) drift.push(`unexpected_foreign_key:${signature}`);
  }
  return drift;
}

function zeroMutation(): FanwardFixtureTableMutation {
  return { inserted: 0, updated: 0, deleted: 0 };
}

export function subtractFanwardFixtureMutationCounters(
  before: FanwardFixtureMutationInventory,
  after: FanwardFixtureMutationInventory,
): FanwardFixtureMutationInventory {
  const result: FanwardFixtureMutationInventory = {};
  for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const earlier = before[table] ?? zeroMutation();
    const later = after[table] ?? zeroMutation();
    const delta = {
      inserted: later.inserted - earlier.inserted,
      updated: later.updated - earlier.updated,
      deleted: later.deleted - earlier.deleted,
    };
    if (delta.inserted < 0 || delta.updated < 0 || delta.deleted < 0) {
      throw new Error(`Fixture mutation counters were non-monotonic for ${table}.`);
    }
    if (delta.inserted || delta.updated || delta.deleted) result[table] = delta;
  }
  return result;
}

export function findFanwardFixtureMutationDrift(
  expected: FanwardFixtureMutationInventory,
  actual: FanwardFixtureMutationInventory,
): string[] {
  const drift: string[] = [];
  const tables = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  for (const table of tables) {
    const expectedMutation = expected[table] ?? zeroMutation();
    const actualMutation = actual[table] ?? zeroMutation();
    for (const operation of ["inserted", "updated", "deleted"] as const) {
      if (actualMutation[operation] !== expectedMutation[operation]) {
        drift.push(`${table}:${operation}:${actualMutation[operation]}!=${expectedMutation[operation]}`);
      }
    }
  }
  return drift;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function findFanwardFixtureDrift(
  context: FanwardFixtureContext,
  ids: FanwardFixtureIds,
  snapshot: FanwardFixtureSnapshot,
): string[] {
  const drift: string[] = [];
  if (!snapshot.site) {
    if (snapshot.identityCollisionIds.length) drift.push("fixture_identity_collision");
    if (
      snapshot.owner
      || snapshot.admin
      || snapshot.memberships.length
      || snapshot.verification
      || snapshot.profiles.length
      || snapshot.revisionIds.length
      || Object.values(snapshot.forbiddenCounts).some((count) => count !== 0)
      || snapshot.unexpectedFixtureAuditCount
    ) drift.push("partial_fixture_residue");
    return drift;
  }
  const target = snapshot.site;
  if (target.id !== ids.siteId) drift.push("site_id");
  if (target.slug !== context.identity.siteSlug) drift.push("site_slug");
  if (target.domain !== context.identity.siteDomain) drift.push("site_domain");
  if (target.name !== context.identity.siteName) drift.push("site_name");
  if (target.description !== context.identity.siteDescription) drift.push("site_description");
  if (target.categoryId !== ids.categoryId) drift.push("site_category");
  if (target.status !== "active") drift.push("site_status");
  if (target.verification !== "tracker") drift.push("site_verification_state");
  if (target.ownership !== "claimed") drift.push("site_ownership_state");
  if (target.submittedByUserId !== ids.ownerUserId) drift.push("site_submitter");
  if (
    target.featured
    || target.isDemo
    || target.publicRevenueVisible
    || target.publicPageMetricsVisible
    || target.logoUrl
    || target.faviconUrl
    || target.ogImageUrl
    || target.permittedAliases.length
    || target.deletedAt
  ) {
    drift.push("site_visibility_boundary");
  }
  if (snapshot.identityCollisionIds.some((id) => id !== ids.siteId)) drift.push("fixture_identity_collision");
  if (!snapshot.category || snapshot.category.id !== ids.categoryId || snapshot.category.slug !== context.categorySlug) drift.push("category");

  const expectedPrincipals = [
    { value: snapshot.owner, id: ids.ownerUserId, accountId: ids.ownerAccountId, role: "user", name: context.identity.ownerName, email: context.identity.ownerEmail },
    { value: snapshot.admin, id: ids.adminUserId, accountId: ids.adminAccountId, role: "admin", name: context.identity.adminName, email: context.identity.adminEmail },
  ] as const;
  for (const principal of expectedPrincipals) {
    const value = principal.value;
    if (!value) {
      drift.push(`${principal.role}_principal_missing`);
      continue;
    }
    if (
      value.id !== principal.id
      || value.name !== principal.name
      || value.email !== principal.email
      || !value.emailVerified
      || value.image !== null
      || value.role !== principal.role
      || !value.isDemo
    ) drift.push(`${principal.role}_principal`);
    if (value.accountCount !== 1) drift.push(`${principal.role}_account_count`);
    if (
      !value.account
      || value.account.id !== principal.accountId
      || value.account.accountId !== principal.id
      || value.account.providerId !== "credential"
      || value.account.issuer !== "credential"
      || !value.account.hasPassword
      || !value.account.passwordMatches
      || value.account.hasOAuthMaterial
    ) drift.push(`${principal.role}_credential`);
  }

  if (
    snapshot.memberships.length !== 1
    || snapshot.memberships[0]?.id !== ids.siteOwnerId
    || snapshot.memberships[0]?.siteId !== ids.siteId
    || snapshot.memberships[0]?.userId !== ids.ownerUserId
    || snapshot.memberships[0]?.role !== "owner"
  ) drift.push("site_owner_membership");
  if (snapshot.otherFixtureUserMembershipCount !== 0) drift.push("unexpected_fixture_user_membership");
  if (snapshot.otherFixtureUserSubmittedSiteCount !== 0) drift.push("unexpected_fixture_user_submission");

  const expectedEvidence = buildFanwardFixtureEvidence(context, ids);
  if (
    !snapshot.verification
    || snapshot.verification.siteId !== ids.siteId
    || snapshot.verification.source !== "tracker"
    || snapshot.verification.method !== "tracker"
    || snapshot.verification.status !== "active"
    || !(snapshot.verification.verifiedAt instanceof Date)
    || snapshot.verification.lastSyncAt !== null
    || snapshot.verification.lastError !== null
    || stableJson(snapshot.verification.evidence) !== stableJson(expectedEvidence)
  ) drift.push("site_verification_evidence");

  if (snapshot.profiles.length > 1 || snapshot.profiles.some((profile) => (
    profile.ownerUserId !== ids.ownerUserId || profile.primarySiteId !== ids.siteId
  ))) drift.push("creator_profile_scope");
  if (!snapshot.profiles.length && snapshot.revisionIds.length) drift.push("orphan_creator_revisions");
  if (Object.values(snapshot.forbiddenCounts).some((count) => count !== 0)) drift.push("forbidden_fixture_data");
  if (snapshot.unexpectedFixtureAuditCount !== 0) drift.push("unexpected_fixture_audit_scope");
  return [...new Set(drift)];
}
