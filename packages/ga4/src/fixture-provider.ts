import { domainMatchState, isAcceptedDomainMatch } from "./domain";
import { GA4_READONLY_SCOPE } from "./oauth";
import type {
  Ga4ConnectionState,
  Ga4CoreQuery,
  Ga4CoreResult,
  Ga4DataStream,
  Ga4Provider,
  Ga4Property,
  Ga4PropertyPage,
  Ga4RealtimeQuery,
  Ga4RealtimeResult,
  Ga4StreamPage,
  Ga4TokenExchangeResult,
  Ga4TokenRefreshResult,
  Ga4ValidationResult,
} from "./types";

const account = { resourceName: "accounts/fixture-account", accountId: "fixture-account", displayName: "SurgeIndex Fixture Account" };
const properties: Ga4Property[] = [
  { resourceName: "properties/123456789", propertyId: "123456789", displayName: "Example Website", accountResourceName: account.resourceName, accountDisplayName: account.displayName, propertyType: "PROPERTY_TYPE_ORDINARY", timeZone: "UTC", currencyCode: "USD" },
  { resourceName: "properties/987654321", propertyId: "987654321", displayName: "Mismatch Website", accountResourceName: account.resourceName, accountDisplayName: account.displayName, propertyType: "PROPERTY_TYPE_ORDINARY", timeZone: "America/Los_Angeles", currencyCode: "USD" },
];

const streams: Ga4DataStream[] = [
  { resourceName: "properties/123456789/dataStreams/111111", streamId: "111111", propertyId: "123456789", displayName: "Example Web", streamType: "web", defaultUri: "https://example.com", measurementId: "G-FIXTURE1234", timeZone: "UTC" },
  { resourceName: "properties/987654321/dataStreams/222222", streamId: "222222", propertyId: "987654321", displayName: "Mismatch Web", streamType: "web", defaultUri: "https://other.example.net", measurementId: "G-FIXTURE5678", timeZone: "America/Los_Angeles" },
  { resourceName: "properties/123456789/dataStreams/333333", streamId: "333333", propertyId: "123456789", displayName: "Fixture Android", streamType: "android", defaultUri: null, measurementId: null, timeZone: null },
];

function pageToken(cursor: string | undefined): number {
  if (!cursor) return 0;
  const parsed = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function nextToken(index: number, length: number): string | null {
  return index < length ? Buffer.from(String(index)).toString("base64url") : null;
}

export class FixtureGa4Provider implements Ga4Provider {
  readonly state: Ga4ConnectionState = "connected";

  async exchangeAuthorizationCode(input: { code: string; codeVerifier: string }): Promise<Ga4TokenExchangeResult> {
    if (input.code !== "fixture-code" || input.codeVerifier.length < 20) throw new Error("invalid_grant");
    return { accessToken: "fixture-access-token", expiresAt: new Date(Date.now() + 3_600_000), refreshToken: "fixture-refresh-token", grantedScopes: [GA4_READONLY_SCOPE], googleSubject: "fixture-google-subject", grantIdentity: "fixture-google-subject" };
  }

  async listAccountsAndProperties(_connectionId: string, cursor?: string): Promise<Ga4PropertyPage> {
    const start = pageToken(cursor);
    const page = properties.slice(start, start + 1);
    return { accounts: start === 0 ? [account] : [], properties: page, nextPageToken: nextToken(start + page.length, properties.length) };
  }

  async listWebStreams(_connectionId: string, propertyId: string, cursor?: string): Promise<Ga4StreamPage> {
    const items = streams.filter((stream) => stream.propertyId === propertyId);
    const start = pageToken(cursor);
    const page = items.slice(start, start + 1);
    return { streams: page, nextPageToken: nextToken(start + page.length, items.length) };
  }

  async validateProperty(_connectionId: string, propertyId: string, streamId: string, siteDomain: string): Promise<Ga4ValidationResult> {
    const property = properties.find((item) => item.propertyId === propertyId) ?? null;
    const stream = streams.find((item) => item.propertyId === propertyId && item.streamId === streamId && item.streamType === "web") ?? null;
    const match = domainMatchState(siteDomain, stream?.defaultUri ?? null);
    return { valid: Boolean(property && stream && isAcceptedDomainMatch(match.state)), matchState: match.state, siteDomain: match.siteHost, streamHost: match.streamHost, property, stream, reason: property && stream ? match.reason : "The fixture property or web stream was not found." };
  }

  async fetchCoreReport(_connectionId: string, query: Ga4CoreQuery): Promise<Ga4CoreResult> {
    const start = new Date(`${query.startDate}T00:00:00.000Z`);
    const end = new Date(`${query.endDate}T00:00:00.000Z`);
    const rows = [];
    for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      const day = date.toISOString().slice(0, 10).replaceAll("-", "");
      rows.push({ dimensions: { date: day }, metrics: { active_users: 120, sessions: 140, screen_page_views: 260, engaged_sessions: 96, engagement_rate: 0.6857, average_session_duration: 74, user_engagement_duration: 10_360, key_events: 4, event_count: 420 } });
    }
    return { rows, propertyId: query.propertyId, propertyTimeZone: "UTC", requestedStartDate: query.startDate, requestedEndDate: query.endDate, partial: false, dataMayStillChange: query.endDate >= new Date().toISOString().slice(0, 10), providerGeneratedAt: new Date().toISOString(), quota: { tokensPerProjectPerHour: 9_900, tokensPerPropertyPerHour: 9_900, concurrentRequests: 10, serverErrorsPerProjectPerHour: 50 }, providerSchemaVersion: "fixture-v1" };
  }

  async fetchRealtimeReport(_connectionId: string, query: Ga4RealtimeQuery): Promise<Ga4RealtimeResult> {
    return { propertyId: query.propertyId, minuteRange: query.minuteRange, activeUsers: query.minuteRange === 5 ? 12 : 42, screenPageViews: query.minuteRange === 5 ? 24 : 91, eventCount: query.minuteRange === 5 ? 38 : 148, keyEvents: 2, providerGeneratedAt: new Date().toISOString(), quota: { tokensPerProjectPerHour: 9_900, tokensPerPropertyPerHour: 9_900, concurrentRequests: 10, serverErrorsPerProjectPerHour: 50 }, providerSchemaVersion: "fixture-v1" };
  }

  async refreshAccessToken(_connectionId: string): Promise<Ga4TokenRefreshResult> {
    return { accessToken: "fixture-access-token-refreshed", expiresAt: new Date(Date.now() + 3_600_000), refreshToken: null, grantedScopes: [GA4_READONLY_SCOPE] };
  }

  async revokeGrant(_connectionId: string): Promise<void> {
    return undefined;
  }
}
