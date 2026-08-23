import "server-only";

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  activityEvent,
  gaAccount,
  gaBackfillJob,
  gaConnection,
  gaCredential,
  gaDataStream,
  gaMetricAggregate,
  gaOauthTransaction,
  gaProperty,
  gaPropertyCapability,
  gaQuotaSnapshot,
  gaRealtimeSnapshot,
  gaReportSnapshot,
  gaSyncJob,
  gaSyncRun,
  getPostgresDb,
  site,
  siteMetricCurrent,
  siteMetricSourcePolicy,
  siteMetricSourceTransition,
  siteOwner,
  type PostgresDatabase,
} from "@surge/db";
import { getServerEnv } from "@surge/config";
import {
  FixtureGa4Provider,
  GoogleGa4Provider,
  createOAuthState,
  createPkcePair,
  domainMatchState,
  hashOAuthState,
  isAcceptedDomainMatch,
  type Ga4CoreResult,
  type Ga4DataStream,
  type Ga4MetricName,
  type Ga4Provider,
  type Ga4Property,
} from "@surge/ga4";
import { createGa4CredentialStore, PostgresGa4CredentialStore } from "./ga4-credential-store";
import { decryptGa4Secret, encryptGa4Secret } from "./ga4-token-crypto";

const SAFE_RETURN_PATH = /^\/(?!\/)[A-Za-z0-9/_?&=.%#:+-]{0,400}$/;
const PROPERTY_ID = /^[0-9A-Za-z_-]{1,128}$/;

export class Ga4ServiceError extends Error {
  constructor(
    public readonly code:
      | "ga4_disabled"
      | "site_not_found"
      | "ownership_required"
      | "site_not_eligible"
      | "connection_not_found"
      | "oauth_transaction_invalid"
      | "oauth_expired"
      | "oauth_exchange_failed"
      | "invalid_return_path"
      | "property_not_found"
      | "stream_not_found"
      | "domain_mismatch"
      | "unsupported_stream"
      | "report_validation_failed"
      | "connection_not_ready"
      | "invalid_property_id"
      | "source_lock_active"
      | "source_not_available"
      | "provider_error",
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "Ga4ServiceError";
  }
}

type OAuthProvider = Ga4Provider & { authorizationUrl?: (state: string, challenge: string, prompt?: "consent" | "select_account") => string };

function assertGa4Enabled(): void {
  if (!getServerEnv().GA4_ENABLED) throw new Ga4ServiceError("ga4_disabled", "Google Analytics connection is not enabled for this environment.", 409);
}

function safeReturnPath(value: string | undefined): string {
  const path = value ?? "/dashboard";
  if (!SAFE_RETURN_PATH.test(path) || path.includes("\\") || path.includes("//")) throw new Ga4ServiceError("invalid_return_path", "Choose a valid SurgeIndex return path.", 400);
  return path;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateDaysAgo(days: number, from = new Date()): string {
  const value = new Date(from);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function parseGaDate(value: string): Date | null {
  if (!/^\d{8}$/.test(value)) return null;
  const parsed = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function providerError(error: unknown): never {
  const code = error instanceof Error ? error.message.split(":")[0] : "provider_error";
  throw new Ga4ServiceError("provider_error", code === "reauthorization_required" ? "Google Analytics access has expired. Reconnect to resume syncing." : "Google Analytics could not complete that request. Your last valid data remains available.", code === "reauthorization_required" ? 409 : 502);
}

function providerFor(db: PostgresDatabase): { provider: OAuthProvider; credentials: PostgresGa4CredentialStore } {
  const env = getServerEnv();
  const credentials = createGa4CredentialStore(db);
  if (env.GA4_PROVIDER_MODE === "google") {
    if (!env.GA4_OAUTH_CLIENT_ID || !env.GA4_OAUTH_CLIENT_SECRET || !env.GA4_OAUTH_REDIRECT_URI) throw new Ga4ServiceError("provider_error", "Google Analytics OAuth is not configured.", 503);
    return { credentials, provider: new GoogleGa4Provider({ clientId: env.GA4_OAUTH_CLIENT_ID, clientSecret: env.GA4_OAUTH_CLIENT_SECRET, redirectUri: env.GA4_OAUTH_REDIRECT_URI, adminApiBaseUrl: env.GA4_ADMIN_API_BASE_URL, dataApiBaseUrl: env.GA4_DATA_API_BASE_URL, credentials, requestTimeoutMs: env.GA4_REQUEST_TIMEOUT_MS }) };
  }
  return { credentials, provider: new FixtureGa4Provider() };
}

async function ownedSite(db: PostgresDatabase, userId: string, siteId: string, requireClaim = true) {
  const ownerPredicate = requireClaim
    ? eq(siteOwner.userId, userId)
    : sql`(${siteOwner.userId} is not null or ${site.submittedByUserId} = ${userId})`;
  const [row] = await db
    .select({ id: site.id, domain: site.domain, name: site.name, status: site.status, ownership: site.ownership, isDemo: site.isDemo })
    .from(site)
    .leftJoin(siteOwner, and(eq(siteOwner.siteId, site.id), eq(siteOwner.userId, userId)))
    .where(and(eq(site.id, siteId), isNull(site.deletedAt), ownerPredicate))
    .limit(1);
  if (!row) throw new Ga4ServiceError("ownership_required", "Only an authorized site owner can connect Google Analytics.", 403);
  if (requireClaim && row.ownership !== "claimed") throw new Ga4ServiceError("ownership_required", "Verify site ownership before connecting Google Analytics.", 403);
  if (row.status !== "active" || row.isDemo) throw new Ga4ServiceError("site_not_eligible", "This site is not eligible for a production traffic connection.", 409);
  return row;
}

async function connectionFor(db: PostgresDatabase, userId: string, siteId: string, requireClaim = true) {
  await ownedSite(db, userId, siteId, requireClaim);
  const [connection] = await db.select().from(gaConnection).where(eq(gaConnection.siteId, siteId)).limit(1);
  if (!connection) throw new Ga4ServiceError("connection_not_found", "Connect a Google Analytics property first.", 404);
  if (connection.userId && connection.userId !== userId) throw new Ga4ServiceError("ownership_required", "This Google Analytics connection belongs to another account.", 403);
  return connection;
}

async function logActivity(db: PostgresDatabase, type: string, siteId: string, detail: string, payload: Record<string, unknown> = {}) {
  // Activity enum values from the earlier batches are intentionally reused;
  // GA4 operational detail stays in the payload and never includes tokens.
  await db.insert(activityEvent).values({ type: type === "ga4_connected" ? "site_verified" : "score_recomputed", siteId, detail, payload: { ga4Event: type, ...payload }, isDemo: false });
}

export async function startGa4OAuth(input: { userId: string; siteId: string; returnPath?: string; reauthorize?: boolean; db?: PostgresDatabase }) {
  assertGa4Enabled();
  const db = input.db ?? getPostgresDb();
  const siteRow = await ownedSite(db, input.userId, input.siteId);
  const { provider } = providerFor(db);
  const state = createOAuthState();
  const pkce = createPkcePair();
  const returnPath = safeReturnPath(input.returnPath ?? `/dashboard/sites/${input.siteId}/ga4`);
  const encrypted = encryptGa4Secret(pkce.verifier, `ga4:oauth:${input.siteId}:${hashOAuthState(state)}`);
  const expiresAt = new Date(Date.now() + 10 * 60_000);

  await db.transaction(async (tx) => {
    await tx.insert(gaOauthTransaction).values({ userId: input.userId, siteId: input.siteId, stateHash: hashOAuthState(state), pkceVerifierEncrypted: encrypted.envelope, pkceKeyVersion: encrypted.keyVersion, returnPath, expiresAt });
    const [existing] = await tx.select({ id: gaConnection.id }).from(gaConnection).where(eq(gaConnection.siteId, input.siteId)).limit(1);
    if (existing) {
      await tx.update(gaConnection).set({ userId: input.userId, connectionState: "authorizing", lastError: null, updatedAt: new Date() }).where(eq(gaConnection.id, existing.id));
    } else {
      await tx.insert(gaConnection).values({ userId: input.userId, siteId: input.siteId, propertyId: "pending", connectionState: "authorizing", status: "active", rankingEligible: false });
    }
  });

  let authorizationUrl: string;
  if (provider.authorizationUrl) {
    authorizationUrl = provider.authorizationUrl(state, pkce.challenge, input.reauthorize ? "consent" : undefined);
  } else {
    const callback = new URL(`/api/sites/${input.siteId}/ga4/callback`, getServerEnv().NEXT_PUBLIC_APP_URL);
    callback.searchParams.set("code", "fixture-code");
    callback.searchParams.set("state", state);
    authorizationUrl = callback.toString();
  }
  await logActivity(db, "ga4_oauth_started", siteRow.id, "GA4 OAuth authorization started.", { connectionSite: siteRow.domain });
  return { authorizationUrl, expiresAt, returnPath };
}

export async function completeGa4OAuth(input: { siteId?: string; code: string; state: string; db?: PostgresDatabase }) {
  assertGa4Enabled();
  const db = input.db ?? getPostgresDb();
  const transactionWhere = input.siteId
    ? and(eq(gaOauthTransaction.siteId, input.siteId), eq(gaOauthTransaction.stateHash, hashOAuthState(input.state)))
    : eq(gaOauthTransaction.stateHash, hashOAuthState(input.state));
  const [transaction] = await db.select().from(gaOauthTransaction).where(transactionWhere).limit(1);
  if (!transaction || transaction.completedAt) throw new Ga4ServiceError("oauth_transaction_invalid", "The Google authorization session is invalid or has already been used.", 400);
  if (transaction.expiresAt.getTime() <= Date.now()) throw new Ga4ServiceError("oauth_expired", "The Google authorization session expired. Start again.", 400);
  const verifier = decryptGa4Secret(transaction.pkceVerifierEncrypted, `ga4:oauth:${transaction.siteId}:${transaction.stateHash}`);
  const { provider, credentials } = providerFor(db);
  let exchange;
  try { exchange = await provider.exchangeAuthorizationCode({ code: input.code, codeVerifier: verifier }); } catch { throw new Ga4ServiceError("oauth_exchange_failed", "Google authorization could not be completed. Start again.", 502); }
  if (!exchange.accessToken || !exchange.grantedScopes.some((scope) => scope === "https://www.googleapis.com/auth/analytics.readonly")) throw new Ga4ServiceError("oauth_exchange_failed", "The grant did not include read-only Google Analytics access.", 400);

  const now = new Date();
  let connectionId = "";
  await db.transaction(async (tx) => {
    const [connection] = await tx.select({ id: gaConnection.id }).from(gaConnection).where(eq(gaConnection.siteId, transaction.siteId)).limit(1);
    if (!connection) throw new Ga4ServiceError("connection_not_found", "The GA4 connection transaction no longer exists.", 409);
    connectionId = connection.id;
    await tx.update(gaConnection).set({ connectionState: "selecting_property", userId: transaction.userId, grantedScopes: exchange.grantedScopes, googleSubject: exchange.googleSubject, grantIdentity: exchange.grantIdentity, lastError: null, updatedAt: now }).where(eq(gaConnection.id, connection.id));
    await tx.update(gaOauthTransaction).set({ completedAt: now, updatedAt: now }).where(eq(gaOauthTransaction.id, transaction.id));
  });
  await credentials.saveInitial({ connectionId, refreshToken: exchange.refreshToken, accessToken: exchange.accessToken, accessTokenExpiresAt: exchange.expiresAt, scopes: exchange.grantedScopes, googleSubject: exchange.googleSubject, grantIdentity: exchange.grantIdentity });
  if (!exchange.refreshToken && !(await credentials.getCredential(connectionId))) await credentials.markReauthorizationRequired(connectionId, "refresh_token_not_returned");
  await logActivity(db, "ga4_oauth_completed", transaction.siteId, "GA4 OAuth grant completed; property selection is required.", { connectionId });
  return { connectionId, returnPath: transaction.returnPath };
}

export async function listGa4Properties(input: { userId: string; siteId: string; cursor?: string; query?: string; db?: PostgresDatabase }) {
  assertGa4Enabled();
  const db = input.db ?? getPostgresDb();
  const connection = await connectionFor(db, input.userId, input.siteId);
  const { provider } = providerFor(db);
  let page;
  try { page = await provider.listAccountsAndProperties(connection.id, input.cursor); } catch (error) { return providerError(error); }
  const filtered = input.query?.trim().toLowerCase()
    ? page.properties.filter((item) => `${item.displayName} ${item.propertyId} ${item.accountDisplayName}`.toLowerCase().includes(input.query!.trim().toLowerCase()))
    : page.properties;
  for (const item of page.accounts) await db.insert(gaAccount).values({ connectionId: connection.id, resourceId: item.resourceName, displayName: item.displayName }).onConflictDoUpdate({ target: [gaAccount.connectionId, gaAccount.resourceId], set: { displayName: item.displayName, updatedAt: new Date() } });
  for (const item of page.properties) {
    const [account] = await db.select({ id: gaAccount.id }).from(gaAccount).where(and(eq(gaAccount.connectionId, connection.id), eq(gaAccount.resourceId, item.accountResourceName))).limit(1);
    await db.insert(gaProperty).values({ connectionId: connection.id, accountId: account?.id ?? null, resourceId: item.resourceName, displayName: item.displayName, propertyType: item.propertyType, timeZone: item.timeZone, currencyCode: item.currencyCode }).onConflictDoUpdate({ target: [gaProperty.connectionId, gaProperty.resourceId], set: { displayName: item.displayName, propertyType: item.propertyType, timeZone: item.timeZone, currencyCode: item.currencyCode, accountId: account?.id ?? null, updatedAt: new Date() } });
  }
  return { accounts: page.accounts, properties: filtered.slice(0, getServerEnv().GA4_MAX_PROPERTIES_PER_USER), nextPageToken: page.nextPageToken };
}

export async function listGa4Streams(input: { userId: string; siteId: string; propertyId: string; cursor?: string; db?: PostgresDatabase }) {
  assertGa4Enabled();
  if (!PROPERTY_ID.test(input.propertyId)) throw new Ga4ServiceError("invalid_property_id", "The property identifier is invalid.", 400);
  const db = input.db ?? getPostgresDb();
  const connection = await connectionFor(db, input.userId, input.siteId);
  const [property] = await db.select().from(gaProperty).where(and(eq(gaProperty.connectionId, connection.id), eq(gaProperty.resourceId, `properties/${input.propertyId}`))).limit(1);
  if (!property) throw new Ga4ServiceError("property_not_found", "This property is not available to the connected Google account.", 404);
  const { provider } = providerFor(db);
  let page;
  try { page = await provider.listWebStreams(connection.id, input.propertyId, input.cursor); } catch (error) { return providerError(error); }
  const [siteRow] = await db.select({ domain: site.domain }).from(site).where(eq(site.id, input.siteId)).limit(1);
  for (const item of page.streams) {
    const match = domainMatchState(siteRow?.domain ?? "", item.defaultUri);
    await db.insert(gaDataStream).values({ propertyId: property.id, resourceId: item.resourceName, displayName: item.displayName, streamType: item.streamType, defaultUri: item.defaultUri, measurementId: item.measurementId, timeZone: item.timeZone, domainMatchState: match.state }).onConflictDoUpdate({ target: [gaDataStream.propertyId, gaDataStream.resourceId], set: { displayName: item.displayName, streamType: item.streamType, defaultUri: item.defaultUri, measurementId: item.measurementId, timeZone: item.timeZone, domainMatchState: match.state, updatedAt: new Date() } });
  }
  return { streams: page.streams.filter((stream) => stream.streamType === "web"), nextPageToken: page.nextPageToken };
}

async function persistSelection(db: PostgresDatabase, connectionId: string, siteId: string, validation: { property: Ga4Property; stream: Ga4DataStream; matchState: string }, report: Ga4CoreResult) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [account] = await tx.select({ id: gaAccount.id }).from(gaAccount).where(and(eq(gaAccount.connectionId, connectionId), eq(gaAccount.resourceId, validation.property.accountResourceName))).limit(1);
    const [property] = await tx.insert(gaProperty).values({ connectionId, accountId: account?.id ?? null, resourceId: validation.property.resourceName, displayName: validation.property.displayName, propertyType: validation.property.propertyType, timeZone: validation.property.timeZone, currencyCode: validation.property.currencyCode }).onConflictDoUpdate({ target: [gaProperty.connectionId, gaProperty.resourceId], set: { displayName: validation.property.displayName, propertyType: validation.property.propertyType, timeZone: validation.property.timeZone, currencyCode: validation.property.currencyCode, updatedAt: now } }).returning({ id: gaProperty.id });
    if (!property) throw new Ga4ServiceError("property_not_found", "The selected property could not be saved.", 409);
    await tx.insert(gaDataStream).values({ propertyId: property.id, resourceId: validation.stream.resourceName, displayName: validation.stream.displayName, streamType: validation.stream.streamType, defaultUri: validation.stream.defaultUri, measurementId: validation.stream.measurementId, timeZone: validation.stream.timeZone, domainMatchState: validation.matchState }).onConflictDoUpdate({ target: [gaDataStream.propertyId, gaDataStream.resourceId], set: { displayName: validation.stream.displayName, defaultUri: validation.stream.defaultUri, measurementId: validation.stream.measurementId, timeZone: validation.stream.timeZone, domainMatchState: validation.matchState, updatedAt: now } });
    await tx.update(gaConnection).set({ propertyId: validation.property.propertyId, propertyName: validation.property.displayName, streamId: validation.stream.streamId, streamName: validation.stream.displayName, streamDefaultUri: validation.stream.defaultUri, measurementId: validation.stream.measurementId, domainMatchState: validation.matchState, propertyTimeZone: validation.property.timeZone, currencyCode: validation.property.currencyCode, connectionState: "connected", lastSuccessfulReportAt: now, lastSyncAt: now, connectedAt: now, rankingEligible: true, providerSchemaVersion: report.providerSchemaVersion, lastError: null, updatedAt: now }).where(eq(gaConnection.id, connectionId));
    await tx.insert(siteMetricSourcePolicy).values({ siteId, primarySource: "tracker", rankingSourceVersion: "tracker-v1" }).onConflictDoNothing();
    const [siteRow] = await tx.select({ verification: site.verification }).from(site).where(eq(site.id, siteId)).limit(1);
    if (siteRow?.verification === "unverified") await tx.update(site).set({ verification: "ga4", updatedAt: now }).where(eq(site.id, siteId));
    await tx.insert(gaPropertyCapability).values({ propertyId: property.id, checkedAt: now, supportedMetrics: Object.keys(report.rows[0]?.metrics ?? {}), unsupportedMetrics: [], compatibilityErrors: [], providerSchemaVersion: report.providerSchemaVersion }).onConflictDoUpdate({ target: gaPropertyCapability.propertyId, set: { checkedAt: now, supportedMetrics: Object.keys(report.rows[0]?.metrics ?? {}), unsupportedMetrics: [], compatibilityErrors: [], providerSchemaVersion: report.providerSchemaVersion, updatedAt: now } });
    await tx.insert(gaBackfillJob).values({ connectionId, startDate: dateDaysAgo(getServerEnv().GA4_INITIAL_BACKFILL_DAYS), endDate: today(), totalDays: getServerEnv().GA4_INITIAL_BACKFILL_DAYS, status: "queued" }).onConflictDoNothing();
    for (const syncType of ["core_recent", "realtime"] as const) await tx.insert(gaSyncJob).values({ connectionId, syncType, status: "queued", nextRunAt: now }).onConflictDoUpdate({ target: [gaSyncJob.connectionId, gaSyncJob.syncType], set: { status: "queued", nextRunAt: now, pausedAt: null, updatedAt: now } });
  });
}

export async function selectGa4Property(input: { userId: string; siteId: string; propertyId: string; streamId: string; db?: PostgresDatabase }) {
  assertGa4Enabled();
  if (!PROPERTY_ID.test(input.propertyId) || !PROPERTY_ID.test(input.streamId)) throw new Ga4ServiceError("invalid_property_id", "The property or stream identifier is invalid.", 400);
  const db = input.db ?? getPostgresDb();
  const connection = await connectionFor(db, input.userId, input.siteId);
  const siteRow = await ownedSite(db, input.userId, input.siteId);
  const { provider } = providerFor(db);
  let validation;
  try { validation = await provider.validateProperty(connection.id, input.propertyId, input.streamId, siteRow.domain); } catch (error) { return providerError(error); }
  if (!validation.property) throw new Ga4ServiceError("property_not_found", "This property no longer appears in the connected Google account.", 404);
  if (!validation.stream || validation.stream.streamType !== "web") throw new Ga4ServiceError("unsupported_stream", "Select a web data stream. Android and iOS streams are not supported here.", 422);
  if (!isAcceptedDomainMatch(validation.matchState) || !["exact", "www_equivalent"].includes(validation.matchState)) throw new Ga4ServiceError("domain_mismatch", "The selected web stream does not match the owned canonical domain.", 422);
  let report;
  try {
    report = await provider.fetchCoreReport(connection.id, { propertyId: input.propertyId, startDate: dateDaysAgo(1), endDate: dateDaysAgo(1), dimensions: ["date"], metrics: ["active_users", "sessions", "screen_page_views", "engagement_rate"], limit: 2 });
  } catch (error) { return providerError(error); }
  if (!report || !report.providerSchemaVersion) throw new Ga4ServiceError("report_validation_failed", "Google Analytics returned an unsupported report response.", 502);
  await persistSelection(db, connection.id, input.siteId, { property: validation.property, stream: validation.stream, matchState: validation.matchState }, report);
  await logActivity(db, "ga4_connected", input.siteId, "GA4 web stream validated and connected.", { propertyId: input.propertyId, streamId: input.streamId, domainMatchState: validation.matchState });
  return { connected: true, property: validation.property, stream: validation.stream, matchState: validation.matchState, reportImported: true };
}

/** Validate a candidate without publishing it as a connected traffic source. */
export async function testGa4Property(input: { userId: string; siteId: string; propertyId: string; streamId: string; db?: PostgresDatabase }) {
  assertGa4Enabled();
  if (!PROPERTY_ID.test(input.propertyId) || !PROPERTY_ID.test(input.streamId)) throw new Ga4ServiceError("invalid_property_id", "The property or stream identifier is invalid.", 400);
  const db = input.db ?? getPostgresDb();
  const connection = await connectionFor(db, input.userId, input.siteId);
  const siteRow = await ownedSite(db, input.userId, input.siteId);
  const { provider } = providerFor(db);
  let validation;
  try { validation = await provider.validateProperty(connection.id, input.propertyId, input.streamId, siteRow.domain); } catch (error) { return providerError(error); }
  if (!validation.property) throw new Ga4ServiceError("property_not_found", "This property no longer appears in the connected Google account.", 404);
  if (!validation.stream || validation.stream.streamType !== "web") throw new Ga4ServiceError("unsupported_stream", "Select a web data stream. Android and iOS streams are not supported here.", 422);
  if (!isAcceptedDomainMatch(validation.matchState) || !["exact", "www_equivalent"].includes(validation.matchState)) throw new Ga4ServiceError("domain_mismatch", "The selected web stream does not match the owned canonical domain.", 422);
  let report;
  try { report = await provider.fetchCoreReport(connection.id, { propertyId: input.propertyId, startDate: dateDaysAgo(1), endDate: dateDaysAgo(1), dimensions: ["date"], metrics: ["active_users", "sessions", "screen_page_views"], limit: 2 }); } catch (error) { return providerError(error); }
  return { valid: true, matchState: validation.matchState, property: validation.property, stream: validation.stream, report: { rows: report.rows.length, providerSchemaVersion: report.providerSchemaVersion, partial: report.partial } };
}

async function upsertAggregate(db: PostgresDatabase, values: typeof gaMetricAggregate["$inferInsert"]) {
  await db.insert(gaMetricAggregate).values(values).onConflictDoUpdate({ target: [gaMetricAggregate.connectionId, gaMetricAggregate.source, gaMetricAggregate.metricName, gaMetricAggregate.window, gaMetricAggregate.bucketStart], set: { bucketEnd: values.bucketEnd, value: values.value, observedAt: values.observedAt, freshness: values.freshness, confidence: values.confidence, providerDefinitionVersion: values.providerDefinitionVersion, partial: values.partial, dataMayStillChange: values.dataMayStillChange, updatedAt: values.updatedAt } });
}

export async function runGa4CoreSync(input: { userId?: string; siteId?: string; connectionId?: string; db?: PostgresDatabase; requestId?: string }) {
  assertGa4Enabled();
  const db = input.db ?? getPostgresDb();
  const connection = input.connectionId ? (await db.select().from(gaConnection).where(eq(gaConnection.id, input.connectionId)).limit(1))[0] : input.siteId && input.userId ? await connectionFor(db, input.userId, input.siteId) : null;
  if (!connection) throw new Ga4ServiceError("connection_not_found", "GA4 connection not found.", 404);
  const { provider } = providerFor(db);
  const start = dateDaysAgo(7);
  const end = dateDaysAgo(1);
  const runStart = new Date();
  const [run] = await db.insert(gaSyncRun).values({ connectionId: connection.id, syncType: "core_recent", status: "running", window: "7d", requestId: input.requestId }).returning({ id: gaSyncRun.id });
  try {
    const result = await provider.fetchCoreReport(connection.id, { propertyId: connection.propertyId, startDate: start, endDate: end, dimensions: ["date"], metrics: ["active_users", "sessions", "screen_page_views", "engaged_sessions", "engagement_rate", "average_session_duration"] });
    let persisted = 0;
    for (const row of result.rows) {
      const bucketStart = parseGaDate(row.dimensions.date);
      if (!bucketStart) continue;
      const bucketEnd = new Date(bucketStart.getTime() + 86_400_000);
      for (const [metricName, value] of Object.entries(row.metrics) as Array<[Ga4MetricName, number | undefined]>) {
        if (value == null || !Number.isFinite(value)) continue;
        await upsertAggregate(db, { siteId: connection.siteId, connectionId: connection.id, source: "ga4", metricName, window: "daily", bucketStart, bucketEnd, value: String(value), observedAt: new Date(), freshness: "fresh", confidence: result.partial ? "0.75" : "1", providerDefinitionVersion: result.providerSchemaVersion, partial: result.partial, dataMayStillChange: result.dataMayStillChange, createdAt: new Date(), updatedAt: new Date() });
        persisted += 1;
      }
    }
    const now = new Date();
    await db.insert(gaReportSnapshot).values({ connectionId: connection.id, propertyId: connection.propertyId, window: "7d", requestedStartDate: start, requestedEndDate: end, propertyTimeZone: result.propertyTimeZone, metricDefinitions: ["active_users", "sessions", "screen_page_views", "engaged_sessions", "engagement_rate", "average_session_duration"], providerResponseMetadata: { quota: result.quota }, importedAt: now, dataDate: end, partial: result.partial, dataMayStillChange: result.dataMayStillChange, providerGeneratedAt: result.providerGeneratedAt ? new Date(result.providerGeneratedAt) : null, providerSchemaVersion: result.providerSchemaVersion });
    await db.insert(gaQuotaSnapshot).values({ connectionId: connection.id, api: "core", state: "healthy", remainingTokens: result.quota.tokensPerPropertyPerHour, concurrentRequests: result.quota.concurrentRequests, serverErrorQuota: result.quota.serverErrorsPerProjectPerHour, observedAt: now, metadata: { ...result.quota } });
    await db.update(gaConnection).set({ lastSyncAt: now, lastSuccessfulReportAt: now, lastError: null, connectionState: "connected", updatedAt: now }).where(eq(gaConnection.id, connection.id));
    if (run) await db.update(gaSyncRun).set({ status: "completed", rowsReceived: result.rows.length, rowsPersisted: persisted, finishedAt: now, durationMs: now.getTime() - runStart.getTime(), updatedAt: now }).where(eq(gaSyncRun.id, run.id));
    return { rowsReceived: result.rows.length, rowsPersisted: persisted, partial: result.partial };
  } catch (error) {
    const now = new Date();
    const code = error instanceof Error ? error.message.split(":")[0] : "sync_failed";
    await db.update(gaSyncRun).set({ status: "failed", errorCode: code, finishedAt: now, durationMs: now.getTime() - runStart.getTime(), updatedAt: now }).where(eq(gaSyncRun.id, run?.id ?? ""));
    await db.update(gaConnection).set({ connectionState: code === "reauthorization_required" ? "reauthorization_required" : "degraded", lastError: code, updatedAt: now }).where(eq(gaConnection.id, connection.id));
    return { rowsReceived: 0, rowsPersisted: 0, partial: true, errorCode: code };
  }
}

export async function runGa4RealtimeSync(input: { userId?: string; siteId?: string; connectionId?: string; db?: PostgresDatabase; requestId?: string }) {
  assertGa4Enabled();
  const db = input.db ?? getPostgresDb();
  const connection = input.connectionId ? (await db.select().from(gaConnection).where(eq(gaConnection.id, input.connectionId)).limit(1))[0] : input.siteId && input.userId ? await connectionFor(db, input.userId, input.siteId) : null;
  if (!connection) throw new Ga4ServiceError("connection_not_found", "GA4 connection not found.", 404);
  const { provider } = providerFor(db);
  const runStart = new Date();
  const [run] = await db.insert(gaSyncRun).values({ connectionId: connection.id, syncType: "realtime", status: "running", window: "realtime_30m", requestId: input.requestId }).returning({ id: gaSyncRun.id });
  try {
    let snapshots = 0;
    for (const minuteRange of [5, 30] as const) {
      const result = await provider.fetchRealtimeReport(connection.id, { propertyId: connection.propertyId, minuteRange, metrics: ["recent_active_users", "screen_page_views", "event_count", "key_events"] });
      const fetchedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000);
      const start = new Date(fetchedAt.getTime() - minuteRange * 60_000);
      await db.insert(gaRealtimeSnapshot).values({ connectionId: connection.id, siteId: connection.siteId, propertyId: connection.propertyId, minuteRangeStart: start, minuteRangeEnd: fetchedAt, activeUsers: result.activeUsers, screenPageViews: result.screenPageViews, eventCount: result.eventCount, keyEvents: result.keyEvents, fetchedAt, providerGeneratedAt: result.providerGeneratedAt ? new Date(result.providerGeneratedAt) : null, expiresAt: new Date(fetchedAt.getTime() + 10 * 60_000), providerSchemaVersion: result.providerSchemaVersion }).onConflictDoUpdate({ target: [gaRealtimeSnapshot.connectionId, gaRealtimeSnapshot.minuteRangeStart, gaRealtimeSnapshot.minuteRangeEnd], set: { activeUsers: result.activeUsers, screenPageViews: result.screenPageViews, eventCount: result.eventCount, keyEvents: result.keyEvents, fetchedAt, expiresAt: new Date(fetchedAt.getTime() + 10 * 60_000) } });
      await upsertAggregate(db, { siteId: connection.siteId, connectionId: connection.id, source: "ga4", metricName: "recent_active_users", window: `realtime_${minuteRange}m`, bucketStart: start, bucketEnd: fetchedAt, value: String(result.activeUsers), observedAt: fetchedAt, freshness: "live", confidence: "1", providerDefinitionVersion: result.providerSchemaVersion, partial: false, dataMayStillChange: true, createdAt: fetchedAt, updatedAt: fetchedAt });
      await db.insert(gaQuotaSnapshot).values({ connectionId: connection.id, api: "realtime", state: "healthy", remainingTokens: result.quota.tokensPerPropertyPerHour, concurrentRequests: result.quota.concurrentRequests, serverErrorQuota: result.quota.serverErrorsPerProjectPerHour, observedAt: fetchedAt, metadata: { ...result.quota } });
      snapshots += 1;
    }
    const now = new Date();
    await db.update(gaConnection).set({ lastSyncAt: now, lastSuccessfulReportAt: now, connectionState: "connected", lastError: null, updatedAt: now }).where(eq(gaConnection.id, connection.id));
    if (run) await db.update(gaSyncRun).set({ status: "completed", rowsReceived: snapshots, rowsPersisted: snapshots, finishedAt: now, durationMs: now.getTime() - runStart.getTime(), updatedAt: now }).where(eq(gaSyncRun.id, run.id));
    return { snapshots };
  } catch (error) {
    const now = new Date();
    const code = error instanceof Error ? error.message.split(":")[0] : "realtime_sync_failed";
    await db.update(gaSyncRun).set({ status: "failed", errorCode: code, finishedAt: now, durationMs: now.getTime() - runStart.getTime(), updatedAt: now }).where(eq(gaSyncRun.id, run?.id ?? ""));
    await db.update(gaConnection).set({ connectionState: code === "reauthorization_required" ? "reauthorization_required" : "degraded", lastError: code, updatedAt: now }).where(eq(gaConnection.id, connection.id));
    return { snapshots: 0, errorCode: code };
  }
}

export async function startGa4Backfill(input: { userId: string; siteId: string; days?: number; dryRun?: boolean; db?: PostgresDatabase }) {
  assertGa4Enabled();
  const db = input.db ?? getPostgresDb();
  const connection = await connectionFor(db, input.userId, input.siteId);
  const days = Math.min(Math.max(input.days ?? getServerEnv().GA4_INITIAL_BACKFILL_DAYS, 1), 365);
  const startDate = dateDaysAgo(days);
  const endDate = today();
  if (input.dryRun) return { status: "queued" as const, startDate, endDate, totalDays: days, dryRun: true };
  const [job] = await db.insert(gaBackfillJob).values({ connectionId: connection.id, startDate, endDate, totalDays: days, dryRun: false, status: "queued" }).onConflictDoUpdate({ target: [gaBackfillJob.connectionId, gaBackfillJob.startDate, gaBackfillJob.endDate], set: { status: "queued", lastErrorCode: null, updatedAt: new Date() } }).returning({ id: gaBackfillJob.id, startDate: gaBackfillJob.startDate, endDate: gaBackfillJob.endDate, totalDays: gaBackfillJob.totalDays, status: gaBackfillJob.status });
  await db.update(gaConnection).set({ connectionState: "backfilling", updatedAt: new Date() }).where(eq(gaConnection.id, connection.id));
  return job;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function runGa4Backfill(input: { userId?: string; siteId?: string; connectionId?: string; db?: PostgresDatabase; requestId?: string }) {
  assertGa4Enabled();
  const db = input.db ?? getPostgresDb();
  const connection = input.connectionId
    ? (await db.select().from(gaConnection).where(eq(gaConnection.id, input.connectionId)).limit(1))[0]
    : input.userId && input.siteId ? await connectionFor(db, input.userId, input.siteId, false) : null;
  if (!connection) throw new Ga4ServiceError("connection_not_found", "GA4 connection not found.", 404);
  const [job] = await db.select().from(gaBackfillJob).where(and(eq(gaBackfillJob.connectionId, connection.id), sql`${gaBackfillJob.status} in ('queued','running','partially_complete')`)).orderBy(desc(gaBackfillJob.createdAt)).limit(1);
  if (!job) return { status: "complete" as const, processedDays: 0, totalDays: 0, skipped: true };
  if (job.dryRun) return { status: "queued" as const, processedDays: 0, totalDays: job.totalDays, dryRun: true };
  const { provider } = providerFor(db);
  const now = new Date();
  await db.update(gaBackfillJob).set({ status: "running", startedAt: job.startedAt ?? now, updatedAt: now }).where(eq(gaBackfillJob.id, job.id));
  let processedDays = job.processedDays;
  let cursor = job.checkpointDate ? addDays(job.checkpointDate, 1) : job.startDate;
  try {
    while (cursor <= job.endDate) {
      const chunkEnd = cursor <= addDays(job.endDate, -6) ? addDays(cursor, 6) : job.endDate;
      const result = await provider.fetchCoreReport(connection.id, { propertyId: connection.propertyId, startDate: cursor, endDate: chunkEnd, dimensions: ["date"], metrics: ["active_users", "sessions", "screen_page_views", "engaged_sessions", "engagement_rate", "average_session_duration"] });
      for (const row of result.rows) {
        const bucketStart = parseGaDate(row.dimensions.date);
        if (!bucketStart) continue;
        const bucketEnd = new Date(bucketStart.getTime() + 86_400_000);
        for (const [metricName, value] of Object.entries(row.metrics) as Array<[Ga4MetricName, number | undefined]>) {
          if (value == null || !Number.isFinite(value)) continue;
          await upsertAggregate(db, { siteId: connection.siteId, connectionId: connection.id, source: "ga4", metricName, window: "daily", bucketStart, bucketEnd, value: String(value), observedAt: now, freshness: "fresh", confidence: result.partial ? "0.75" : "1", providerDefinitionVersion: result.providerSchemaVersion, partial: result.partial, dataMayStillChange: result.dataMayStillChange, createdAt: now, updatedAt: now });
        }
      }
      const daysInChunk = Math.floor((new Date(`${chunkEnd}T00:00:00Z`).getTime() - new Date(`${cursor}T00:00:00Z`).getTime()) / 86_400_000) + 1;
      processedDays = Math.min(job.totalDays, processedDays + daysInChunk);
      await db.update(gaBackfillJob).set({ processedDays, checkpointDate: chunkEnd, status: chunkEnd >= job.endDate ? "complete" : "partially_complete", updatedAt: new Date() }).where(eq(gaBackfillJob.id, job.id));
      cursor = addDays(chunkEnd, 1);
    }
    await db.update(gaBackfillJob).set({ status: "complete", processedDays: job.totalDays, completedAt: new Date(), updatedAt: new Date() }).where(eq(gaBackfillJob.id, job.id));
    await db.update(gaConnection).set({ connectionState: "connected", lastSuccessfulReportAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(gaConnection.id, connection.id));
    return { status: "complete" as const, processedDays: job.totalDays, totalDays: job.totalDays };
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "backfill_failed";
    await db.update(gaBackfillJob).set({ status: processedDays > 0 ? "partially_complete" : "failed", processedDays, lastErrorCode: code, updatedAt: new Date() }).where(eq(gaBackfillJob.id, job.id));
    await db.update(gaConnection).set({ connectionState: code === "reauthorization_required" ? "reauthorization_required" : "degraded", lastError: code, updatedAt: new Date() }).where(eq(gaConnection.id, connection.id));
    return { status: processedDays > 0 ? "partially_complete" as const : "failed" as const, processedDays, totalDays: job.totalDays, errorCode: code };
  }
}

export async function getGa4Status(input: { userId: string; siteId: string; db?: PostgresDatabase }) {
  const db = input.db ?? getPostgresDb();
  await ownedSite(db, input.userId, input.siteId, false);
  const [connection] = await db.select().from(gaConnection).where(eq(gaConnection.siteId, input.siteId)).limit(1);
  if (!connection) return { connection: null, backfill: null, syncs: [], quota: [] };
  const backfill = (await db.select().from(gaBackfillJob).where(eq(gaBackfillJob.connectionId, connection.id)).orderBy(desc(gaBackfillJob.createdAt)).limit(1))[0] ?? null;
  const syncs = await db.select().from(gaSyncJob).where(eq(gaSyncJob.connectionId, connection.id));
  const quota = await db.select().from(gaQuotaSnapshot).where(eq(gaQuotaSnapshot.connectionId, connection.id)).orderBy(desc(gaQuotaSnapshot.observedAt)).limit(10);
  const [policy] = await db.select().from(siteMetricSourcePolicy).where(eq(siteMetricSourcePolicy.siteId, input.siteId)).limit(1);
  return { connection: { id: connection.id, propertyId: connection.propertyId, propertyName: connection.propertyName, streamId: connection.streamId, streamName: connection.streamName, streamDefaultUri: connection.streamDefaultUri, measurementId: connection.measurementId, domainMatchState: connection.domainMatchState, propertyTimeZone: connection.propertyTimeZone, currencyCode: connection.currencyCode, grantedScopes: connection.grantedScopes, connectionState: connection.connectionState, lastSuccessfulReportAt: connection.lastSuccessfulReportAt, lastSyncAt: connection.lastSyncAt, lastRefreshAt: connection.lastRefreshAt, lastRefreshFailure: connection.lastRefreshFailure, revokedAt: connection.revokedAt, rankingEligible: connection.rankingEligible, providerSchemaVersion: connection.providerSchemaVersion, lastError: connection.lastError }, backfill, syncs, quota, rankingSource: policy?.primarySource ?? "tracker", rankingSourceVersion: policy?.rankingSourceVersion ?? "tracker-v1" };
}

export async function disconnectGa4(input: { userId: string; siteId: string; revoke?: boolean; db?: PostgresDatabase }) {
  assertGa4Enabled();
  const db = input.db ?? getPostgresDb();
  const connection = await connectionFor(db, input.userId, input.siteId, false);
  if (input.revoke) {
    const { provider } = providerFor(db);
    try { await provider.revokeGrant(connection.id); } catch { throw new Ga4ServiceError("provider_error", "Google access could not be revoked. The local connection was not changed.", 502); }
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(gaConnection).set({ connectionState: input.revoke ? "revoked" : "disconnected", status: "disconnected", rankingEligible: false, revokedAt: input.revoke ? now : null, updatedAt: now }).where(eq(gaConnection.id, connection.id));
    await tx.update(gaSyncJob).set({ status: "cancelled", pausedAt: now, updatedAt: now }).where(eq(gaSyncJob.connectionId, connection.id));
    await tx.delete(gaCredential).where(eq(gaCredential.connectionId, connection.id));
  });
  await logActivity(db, input.revoke ? "ga4_revoked" : "ga4_disconnected", input.siteId, input.revoke ? "Google Analytics grant revoked and local sync stopped." : "Google Analytics disconnected from SurgeIndex; imported history retained.", {});
  return { disconnected: true, revoked: Boolean(input.revoke), historyRetained: true };
}

export async function getGa4Comparison(input: { userId: string; siteId: string; db?: PostgresDatabase }) {
  const db = input.db ?? getPostgresDb();
  const connection = await connectionFor(db, input.userId, input.siteId, false);
  const [tracker] = await db.select({ visitors24h: siteMetricCurrent.visitors24h, pageviews24h: siteMetricCurrent.pageviews24h, sessions24h: siteMetricCurrent.sessions24h }).from(siteMetricCurrent).where(eq(siteMetricCurrent.siteId, input.siteId)).limit(1);
  // Daily GA4 rows are property-timezone dates and may be older than 24 UTC hours
  // around midnight. Keep a two-day reconciliation window for the owner comparison.
  const since = new Date(Date.now() - 48 * 60 * 60_000);
  const rows = await db.select({ metricName: gaMetricAggregate.metricName, value: gaMetricAggregate.value, bucketStart: gaMetricAggregate.bucketStart }).from(gaMetricAggregate).where(and(eq(gaMetricAggregate.connectionId, connection.id), gte(gaMetricAggregate.bucketStart, since), eq(gaMetricAggregate.window, "daily")));
  const ga4 = Object.fromEntries(rows.map((row) => [row.metricName, Number(row.value)]));
  return { tracker: { visitors24h: tracker?.visitors24h ?? null, pageviews24h: tracker?.pageviews24h ?? null, sessions24h: tracker?.sessions24h ?? null }, ga4: { activeUsers24h: ga4.active_users ?? null, screenPageViews24h: ga4.screen_page_views ?? null, sessions24h: ga4.sessions ?? null }, note: "Tracker and GA4 definitions differ; values are shown side by side and are never summed." };
}

export async function switchPrimaryGa4Source(input: { userId: string; siteId: string; source: "tracker" | "ga4"; reason: string; requestId: string; db?: PostgresDatabase }) {
  const db = input.db ?? getPostgresDb();
  await ownedSite(db, input.userId, input.siteId);
  const [policy] = await db.select().from(siteMetricSourcePolicy).where(eq(siteMetricSourcePolicy.siteId, input.siteId)).limit(1);
  const current = policy?.primarySource ?? "tracker";
  if (current === input.source) return { changed: false, source: current };
  if (policy?.rankingSourceLockedUntil && policy.rankingSourceLockedUntil.getTime() > Date.now()) throw new Ga4ServiceError("source_lock_active", "The ranking source is locked during its review period.", 409);
  if (input.source === "ga4") {
    const [connection] = await db.select({ id: gaConnection.id, rankingEligible: gaConnection.rankingEligible, connectionState: gaConnection.connectionState }).from(gaConnection).where(eq(gaConnection.siteId, input.siteId)).limit(1);
    if (!connection?.rankingEligible || connection.connectionState !== "connected") throw new Ga4ServiceError("source_not_available", "GA4 must have a successful imported report before it can become the primary ranking source.", 409);
  }
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + getServerEnv().GA4_SOURCE_SWITCH_LOCK_DAYS * 86_400_000);
  const provisionalUntil = new Date(now.getTime() + getServerEnv().GA4_SOURCE_OVERLAP_REVIEW_DAYS * 86_400_000);
  await db.transaction(async (tx) => {
    await tx.insert(siteMetricSourcePolicy).values({ siteId: input.siteId, primarySource: input.source, previousRankingSource: current, sourceSwitchReason: input.reason, rankingSourceVersion: `${input.source}-v1`, rankingSourceStartedAt: now, rankingSourceLockedUntil: lockedUntil, provisionalUntil: provisionalUntil, baselineCompatible: false }).onConflictDoUpdate({ target: siteMetricSourcePolicy.siteId, set: { primarySource: input.source, previousRankingSource: current, sourceSwitchReason: input.reason, rankingSourceVersion: `${input.source}-v1`, rankingSourceStartedAt: now, rankingSourceLockedUntil: lockedUntil, provisionalUntil, baselineCompatible: false, updatedAt: now } });
    await tx.insert(siteMetricSourceTransition).values({ siteId: input.siteId, fromSource: current, toSource: input.source, reason: input.reason, actorUserId: input.userId, requestId: input.requestId, baselineCompatibleBefore: policy?.baselineCompatible ?? true, baselineCompatibleAfter: false, provisionalUntil });
  });
  return { changed: true, source: input.source, lockedUntil, provisionalUntil };
}

export async function getGa4PublicRealtime(siteId: string, db: PostgresDatabase = getPostgresDb()) {
  const [row] = await db.select().from(gaRealtimeSnapshot).where(and(eq(gaRealtimeSnapshot.siteId, siteId), gte(gaRealtimeSnapshot.expiresAt, new Date()))).orderBy(desc(gaRealtimeSnapshot.fetchedAt)).limit(1);
  if (!row) return null;
  return { activeUsers: row.activeUsers, screenPageViews: row.screenPageViews, eventCount: row.eventCount, keyEvents: row.keyEvents, minuteRange: Math.round((row.minuteRangeEnd.getTime() - row.minuteRangeStart.getTime()) / 60_000), fetchedAt: row.fetchedAt, expiresAt: row.expiresAt, label: `GA4 active users — last ${Math.round((row.minuteRangeEnd.getTime() - row.minuteRangeStart.getTime()) / 60_000)} minutes` };
}

export async function getGa4Operations(db: PostgresDatabase = getPostgresDb()) {
  const connections = await db.select({ id: gaConnection.id, siteId: gaConnection.siteId, propertyId: gaConnection.propertyId, propertyName: gaConnection.propertyName, state: gaConnection.connectionState, lastSyncAt: gaConnection.lastSyncAt, lastError: gaConnection.lastError, rankingEligible: gaConnection.rankingEligible, keyVersion: gaCredential.encryptionKeyVersion }).from(gaConnection).leftJoin(gaCredential, eq(gaCredential.connectionId, gaConnection.id)).orderBy(desc(gaConnection.updatedAt));
  const backfills = await db.select().from(gaBackfillJob).where(sql`${gaBackfillJob.status} in ('queued','running','partially_complete','failed')`).orderBy(desc(gaBackfillJob.updatedAt)).limit(100);
  const quotaLimited = await db.select().from(gaQuotaSnapshot).where(sql`${gaQuotaSnapshot.state} in ('limited','throttled','exhausted')`).orderBy(desc(gaQuotaSnapshot.observedAt)).limit(100);
  return { connections, backfills, quotaLimited, tokenVersions: [...new Set(connections.map((row) => row.keyVersion).filter(Boolean))] };
}
