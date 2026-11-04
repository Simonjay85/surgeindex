export type Ga4ConnectionState =
  | "initiated"
  | "authorizing"
  | "selecting_property"
  | "validating_property"
  | "backfilling"
  | "connected"
  | "degraded"
  | "reauthorization_required"
  | "revoked"
  | "disconnected"
  | "error";

export type Ga4MetricName =
  | "active_users"
  | "sessions"
  | "screen_page_views"
  | "engaged_sessions"
  | "engagement_rate"
  | "average_session_duration"
  | "user_engagement_duration"
  | "key_events"
  | "event_count"
  | "recent_active_users";

export type Ga4DimensionName = "date" | "dateHour";
export type Ga4ReportKind = "core" | "realtime";
export type Ga4QuotaState = "healthy" | "limited" | "throttled" | "exhausted" | "recovering" | "unknown";

export interface Ga4Account {
  resourceName: string;
  accountId: string;
  displayName: string;
}

export interface Ga4Property {
  resourceName: string;
  propertyId: string;
  displayName: string;
  accountResourceName: string;
  accountDisplayName: string;
  propertyType: string | null;
  timeZone: string | null;
  currencyCode: string | null;
}

export interface Ga4PropertyPage {
  accounts: Ga4Account[];
  properties: Ga4Property[];
  nextPageToken: string | null;
}

export interface Ga4DataStream {
  resourceName: string;
  streamId: string;
  propertyId: string;
  displayName: string;
  streamType: "web" | "ios" | "android" | "unknown";
  defaultUri: string | null;
  measurementId: string | null;
  timeZone: string | null;
}

export interface Ga4StreamPage {
  streams: Ga4DataStream[];
  nextPageToken: string | null;
}

export type DomainMatchState = "exact" | "www_equivalent" | "approved_subdomain" | "approved_alias" | "mismatch" | "unknown";

export interface Ga4ValidationResult {
  valid: boolean;
  matchState: DomainMatchState;
  siteDomain: string;
  streamHost: string | null;
  property: Ga4Property | null;
  stream: Ga4DataStream | null;
  reason: string;
}

export interface Ga4CoreQuery {
  propertyId: string;
  startDate: string;
  endDate: string;
  dimensions: Ga4DimensionName[];
  metrics: Ga4MetricName[];
  limit?: number;
  offset?: number;
}

export interface Ga4RealtimeQuery {
  propertyId: string;
  minuteRange: 5 | 30;
  metrics: Extract<Ga4MetricName, "recent_active_users" | "screen_page_views" | "event_count" | "key_events">[];
}

export interface Ga4CoreRow {
  dimensions: Record<string, string>;
  metrics: Partial<Record<Ga4MetricName, number>>;
}

export interface Ga4QuotaMetadata {
  tokensPerProjectPerHour: number | null;
  tokensPerPropertyPerHour: number | null;
  concurrentRequests: number | null;
  serverErrorsPerProjectPerHour: number | null;
}

export interface Ga4CoreResult {
  rows: Ga4CoreRow[];
  propertyId: string;
  propertyTimeZone: string | null;
  requestedStartDate: string;
  requestedEndDate: string;
  partial: boolean;
  dataMayStillChange: boolean;
  providerGeneratedAt: string | null;
  quota: Ga4QuotaMetadata;
  providerSchemaVersion: string;
}

export interface Ga4RealtimeResult {
  propertyId: string;
  minuteRange: 5 | 30;
  activeUsers: number;
  screenPageViews: number;
  eventCount: number;
  keyEvents: number;
  providerGeneratedAt: string | null;
  quota: Ga4QuotaMetadata;
  providerSchemaVersion: string;
}

export interface Ga4TokenExchangeResult {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string | null;
  grantedScopes: string[];
  googleSubject: string | null;
  grantIdentity: string | null;
}

export interface Ga4TokenRefreshResult {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string | null;
  grantedScopes: string[];
}

export interface Ga4CredentialRecord {
  connectionId: string;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  grantedScopes: string[];
  googleSubject: string | null;
  grantIdentity: string | null;
}

export interface Ga4CredentialStore {
  getCredential(connectionId: string): Promise<Ga4CredentialRecord | null>;
  saveAccessToken(connectionId: string, accessToken: string, expiresAt: Date): Promise<void>;
  saveRefreshToken(connectionId: string, refreshToken: string, scopes: string[], googleSubject: string | null, grantIdentity: string | null): Promise<void>;
  recordRefreshSuccess(connectionId: string, at: Date): Promise<void>;
  recordRefreshFailure(connectionId: string, code: string, at: Date): Promise<void>;
  markReauthorizationRequired(connectionId: string, code: string): Promise<void>;
  markRevoked(connectionId: string, at: Date): Promise<void>;
}

export interface Ga4TransportRequest {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface Ga4TransportResponse {
  status: number;
  headers: Headers;
  body: string;
}

export interface Ga4Transport {
  request(input: Ga4TransportRequest): Promise<Ga4TransportResponse>;
}

export interface Ga4Provider {
  exchangeAuthorizationCode(input: { code: string; codeVerifier: string }): Promise<Ga4TokenExchangeResult>;
  listAccountsAndProperties(connectionId: string, cursor?: string): Promise<Ga4PropertyPage>;
  listWebStreams(connectionId: string, propertyId: string, cursor?: string): Promise<Ga4StreamPage>;
  validateProperty(connectionId: string, propertyId: string, streamId: string, siteDomain: string): Promise<Ga4ValidationResult>;
  fetchCoreReport(connectionId: string, query: Ga4CoreQuery): Promise<Ga4CoreResult>;
  fetchRealtimeReport(connectionId: string, query: Ga4RealtimeQuery): Promise<Ga4RealtimeResult>;
  refreshAccessToken(connectionId: string): Promise<Ga4TokenRefreshResult>;
  revokeGrant(connectionId: string): Promise<void>;
}
