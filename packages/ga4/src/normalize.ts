import { domainMatchState } from "./domain";
import type {
  DomainMatchState,
  Ga4Account,
  Ga4CoreQuery,
  Ga4CoreResult,
  Ga4DataStream,
  Ga4MetricName,
  Ga4Property,
  Ga4RealtimeQuery,
  Ga4RealtimeResult,
  Ga4StreamPage,
  Ga4PropertyPage,
  Ga4QuotaMetadata,
} from "./types";

export function resourceId(resourceName: string | undefined, prefix: string): string {
  const value = resourceName ?? "";
  return value.startsWith(prefix) ? value.slice(prefix.length) : value.split("/").pop() ?? value;
}

export function normalizeAccount(value: Record<string, unknown>): Ga4Account {
  const resourceName = String(value.name ?? "");
  return { resourceName, accountId: resourceId(resourceName, "accounts/"), displayName: String(value.displayName ?? resourceName) };
}

export function normalizeProperty(value: Record<string, unknown>, account: Ga4Account): Ga4Property {
  const resourceName = String(value.name ?? "");
  return {
    resourceName,
    propertyId: resourceId(resourceName, "properties/"),
    displayName: String(value.displayName ?? resourceName),
    accountResourceName: account.resourceName,
    accountDisplayName: account.displayName,
    propertyType: value.propertyType == null ? null : String(value.propertyType),
    timeZone: value.timeZone == null ? null : String(value.timeZone),
    currencyCode: value.currencyCode == null ? null : String(value.currencyCode),
  };
}

export function normalizePropertyPage(value: Record<string, unknown>, accounts: Ga4Account[] = []): Ga4PropertyPage {
  const pageAccounts = Array.isArray(value.accounts) ? value.accounts.map((item) => normalizeAccount(item as Record<string, unknown>)) : accounts;
  const accountByName = new Map(pageAccounts.map((account) => [account.resourceName, account]));
  const properties = Array.isArray(value.properties)
    ? value.properties.map((item) => {
        const raw = item as Record<string, unknown>;
        const parent = String(raw.parent ?? "");
        const account = accountByName.get(parent) ?? { resourceName: parent, accountId: resourceId(parent, "accounts/"), displayName: parent };
        return normalizeProperty(raw, account);
      })
    : [];
  return { accounts: pageAccounts, properties, nextPageToken: value.nextPageToken ? String(value.nextPageToken) : null };
}

function streamType(value: unknown): Ga4DataStream["streamType"] {
  if (value === "WEB_DATA_STREAM") return "web";
  if (value === "ANDROID_APP_DATA_STREAM") return "android";
  if (value === "IOS_APP_DATA_STREAM") return "ios";
  return "unknown";
}

export function normalizeStream(value: Record<string, unknown>): Ga4DataStream {
  const resourceName = String(value.name ?? "");
  const propertyResource = resourceName.split("/dataStreams/")[0] ?? "";
  const web = (value.webStreamData as Record<string, unknown> | undefined) ?? {};
  return {
    resourceName,
    streamId: resourceId(resourceName, "dataStreams/"),
    propertyId: resourceId(propertyResource, "properties/"),
    displayName: String(value.displayName ?? resourceName),
    streamType: streamType(value.type),
    defaultUri: web.defaultUri == null ? null : String(web.defaultUri),
    measurementId: web.measurementId == null ? null : String(web.measurementId),
    timeZone: value.timeZone == null ? null : String(value.timeZone),
  };
}

export function normalizeStreamPage(value: Record<string, unknown>): Ga4StreamPage {
  return { streams: Array.isArray(value.dataStreams) ? value.dataStreams.map((item) => normalizeStream(item as Record<string, unknown>)) : [], nextPageToken: value.nextPageToken ? String(value.nextPageToken) : null };
}

function quota(value: Record<string, unknown> | undefined): Ga4QuotaMetadata {
  const tokens = (value?.tokensPerProjectPerHour as Record<string, unknown> | undefined) ?? {};
  const property = (value?.tokensPerPropertyPerHour as Record<string, unknown> | undefined) ?? {};
  const concurrent = (value?.concurrentRequests as Record<string, unknown> | undefined) ?? {};
  const server = (value?.serverErrorsPerProjectPerHour as Record<string, unknown> | undefined) ?? {};
  const number = (entry: Record<string, unknown>) => entry.consumed == null ? entry.remaining == null ? null : Number(entry.remaining) : Number(entry.consumed);
  return { tokensPerProjectPerHour: number(tokens), tokensPerPropertyPerHour: number(property), concurrentRequests: number(concurrent), serverErrorsPerProjectPerHour: number(server) };
}

export function normalizeCoreReport(value: Record<string, unknown>, query: Ga4CoreQuery, propertyTimeZone: string | null): Ga4CoreResult {
  const dimensionHeaders = Array.isArray(value.dimensionHeaders) ? value.dimensionHeaders.map((header) => String((header as Record<string, unknown>).name ?? "")) : query.dimensions;
  const metricHeaders = Array.isArray(value.metricHeaders) ? value.metricHeaders.map((header) => String((header as Record<string, unknown>).name ?? "")) : query.metrics;
  const rows = Array.isArray(value.rows) ? value.rows.map((row) => {
    const raw = row as Record<string, unknown>;
    const dimensionValues = Array.isArray(raw.dimensionValues) ? raw.dimensionValues : [];
    const metricValues = Array.isArray(raw.metricValues) ? raw.metricValues : [];
    const dimensions: Record<string, string> = {};
    dimensionHeaders.forEach((header, index) => { dimensions[header] = String((dimensionValues[index] as Record<string, unknown> | undefined)?.value ?? ""); });
    const metrics: Partial<Record<Ga4MetricName, number>> = {};
    metricHeaders.forEach((header, index) => { const parsed = Number((metricValues[index] as Record<string, unknown> | undefined)?.value ?? 0); const normalized = fromProviderMetric(header); if (Number.isFinite(parsed) && normalized) metrics[normalized] = parsed; });
    return { dimensions, metrics };
  }) : [];
  return { rows, propertyId: query.propertyId, propertyTimeZone, requestedStartDate: query.startDate, requestedEndDate: query.endDate, partial: Boolean(value.metadata && (value.metadata as Record<string, unknown>).dataLossFromOtherRow), dataMayStillChange: query.endDate >= new Date().toISOString().slice(0, 10), providerGeneratedAt: new Date().toISOString(), quota: quota(value.propertyQuota as Record<string, unknown> | undefined), providerSchemaVersion: "google-data-v1beta" };
}

export function normalizeRealtimeReport(value: Record<string, unknown>, query: Ga4RealtimeQuery): Ga4RealtimeResult {
  const headers = Array.isArray(value.metricHeaders) ? value.metricHeaders.map((header) => String((header as Record<string, unknown>).name ?? "")) : [];
  const row = Array.isArray(value.rows) ? value.rows[0] as Record<string, unknown> | undefined : undefined;
  const values = Array.isArray(row?.metricValues) ? row.metricValues : [];
  const metrics: Record<string, number> = {};
  headers.forEach((header, index) => { const parsed = Number((values[index] as Record<string, unknown> | undefined)?.value ?? 0); const normalized = fromProviderMetric(header); if (normalized) metrics[normalized] = Number.isFinite(parsed) ? parsed : 0; });
  return { propertyId: query.propertyId, minuteRange: query.minuteRange, activeUsers: metrics.recent_active_users ?? metrics.active_users ?? 0, screenPageViews: metrics.screen_page_views ?? 0, eventCount: metrics.event_count ?? 0, keyEvents: metrics.key_events ?? 0, providerGeneratedAt: new Date().toISOString(), quota: quota(value.propertyQuota as Record<string, unknown> | undefined), providerSchemaVersion: "google-data-v1beta" };
}

const providerMetricNames: Record<string, Ga4MetricName> = {
  activeUsers: "active_users",
  active_users: "active_users",
  sessions: "sessions",
  screenPageViews: "screen_page_views",
  screen_page_views: "screen_page_views",
  engagedSessions: "engaged_sessions",
  engaged_sessions: "engaged_sessions",
  engagementRate: "engagement_rate",
  engagement_rate: "engagement_rate",
  averageSessionDuration: "average_session_duration",
  average_session_duration: "average_session_duration",
  userEngagementDuration: "user_engagement_duration",
  user_engagement_duration: "user_engagement_duration",
  keyEvents: "key_events",
  key_events: "key_events",
  eventCount: "event_count",
  event_count: "event_count",
  recent_active_users: "recent_active_users",
};

export function fromProviderMetric(value: string): Ga4MetricName | null {
  return providerMetricNames[value] ?? null;
}

export function validationFor(siteDomain: string, streamUri: string | null, property: Ga4Property | null, stream: Ga4DataStream | null): { valid: boolean; matchState: DomainMatchState; streamHost: string | null; reason: string } {
  const match = domainMatchState(siteDomain, streamUri);
  return { valid: Boolean(property && stream && stream.streamType === "web" && ["exact", "www_equivalent"].includes(match.state)), matchState: match.state, streamHost: match.streamHost, reason: property && stream && stream.streamType === "web" ? match.reason : "A readable web data stream is required." };
}
