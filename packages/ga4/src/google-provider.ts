import { buildGoogleAuthorizationUrl, GA4_READONLY_SCOPE, hasReadOnlyAnalyticsScope, parseGrantedScopes } from "./oauth";
import { domainMatchState, isAcceptedDomainMatch } from "./domain";
import { normalizeAccount, normalizeCoreReport, normalizePropertyPage, normalizeRealtimeReport, normalizeStreamPage, resourceId } from "./normalize";
import { retryableGoogleStatus } from "./backoff";
import type {
  Ga4CoreQuery,
  Ga4CoreResult,
  Ga4CredentialStore,
  Ga4DataStream,
  Ga4Provider,
  Ga4Property,
  Ga4PropertyPage,
  Ga4RealtimeQuery,
  Ga4RealtimeResult,
  Ga4StreamPage,
  Ga4TokenExchangeResult,
  Ga4TokenRefreshResult,
  Ga4Transport,
  Ga4ValidationResult,
} from "./types";

const TOKEN_API = "https://oauth2.googleapis.com/token";
const REVOKE_API = "https://oauth2.googleapis.com/revoke";

export class GoogleGa4Provider implements Ga4Provider {
  constructor(private readonly options: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    credentials: Ga4CredentialStore;
    adminApiBaseUrl?: string;
    dataApiBaseUrl?: string;
    transport?: Ga4Transport;
    requestTimeoutMs?: number;
  }) {}

  authorizationUrl(state: string, codeChallenge: string, prompt?: "consent" | "select_account"): string {
    return buildGoogleAuthorizationUrl({ clientId: this.options.clientId, redirectUri: this.options.redirectUri, state, codeChallenge, prompt });
  }

  async exchangeAuthorizationCode(input: { code: string; codeVerifier: string }): Promise<Ga4TokenExchangeResult> {
    const json = await this.requestToken({ grant_type: "authorization_code", code: input.code, code_verifier: input.codeVerifier, redirect_uri: this.options.redirectUri, client_id: this.options.clientId, client_secret: this.options.clientSecret });
    const scopes = parseGrantedScopes(json.scope as string | undefined);
    if (!hasReadOnlyAnalyticsScope(scopes)) throw new Error("invalid_scope");
    return { accessToken: String(json.access_token ?? ""), expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000), refreshToken: json.refresh_token ? String(json.refresh_token) : null, grantedScopes: scopes, googleSubject: json.id_token ? decodeIdTokenSubject(String(json.id_token)) : null, grantIdentity: json.id_token ? decodeIdTokenSubject(String(json.id_token)) : null };
  }

  async listAccountsAndProperties(connectionId: string, cursor?: string): Promise<Ga4PropertyPage> {
    const state = decodeCursor(cursor);
    const accountsResponse = await this.getJson(`${this.options.adminApiBaseUrl ?? "https://analyticsadmin.googleapis.com/v1beta"}/accounts?pageSize=100${state.accountPageToken ? `&pageToken=${encodeURIComponent(state.accountPageToken)}` : ""}`, connectionId);
    const accountValues = Array.isArray(accountsResponse.accounts) ? accountsResponse.accounts.map((item) => normalizeAccount(item as Record<string, unknown>)) : [];
    const allAccounts = accountValues;
    const properties: Ga4Property[] = [];
    let accountIndex = state.accountIndex;
    let propertyPageToken = state.propertyPageToken;
    while (accountIndex < allAccounts.length && properties.length < 100) {
      const account = allAccounts[accountIndex];
      const query = propertyPageToken ? `&pageToken=${encodeURIComponent(propertyPageToken)}` : "";
      const propertyResponse = await this.getJson(`${this.options.adminApiBaseUrl ?? "https://analyticsadmin.googleapis.com/v1beta"}/properties?filter=parent:${encodeURIComponent(account.resourceName)}&pageSize=100${query}`, connectionId);
      const page = normalizePropertyPage({ ...propertyResponse, accounts: [account] }, [account]);
      properties.push(...page.properties);
      if (page.nextPageToken) { propertyPageToken = page.nextPageToken; break; }
      accountIndex += 1;
      propertyPageToken = null;
    }
    const accountPageToken = accountIndex >= allAccounts.length ? (accountsResponse.nextPageToken ? String(accountsResponse.nextPageToken) : null) : state.accountPageToken ?? null;
    const hasMore = Boolean(propertyPageToken || accountPageToken);
    return { accounts: allAccounts, properties, nextPageToken: hasMore ? encodeCursor({ accountIndex: propertyPageToken ? accountIndex : 0, accountPageToken, propertyPageToken }) : null };
  }

  async listWebStreams(connectionId: string, propertyId: string, cursor?: string): Promise<Ga4StreamPage> {
    const page = await this.getJson(`${this.options.adminApiBaseUrl ?? "https://analyticsadmin.googleapis.com/v1beta"}/properties/${encodeURIComponent(propertyId)}/dataStreams?pageSize=100${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ""}`, connectionId);
    return normalizeStreamPage(page);
  }

  async validateProperty(connectionId: string, propertyId: string, streamId: string, siteDomain: string): Promise<Ga4ValidationResult> {
    const [propertyValue, streamValue] = await Promise.all([
      this.getJson(`${this.options.adminApiBaseUrl ?? "https://analyticsadmin.googleapis.com/v1beta"}/properties/${encodeURIComponent(propertyId)}`, connectionId),
      this.getJson(`${this.options.adminApiBaseUrl ?? "https://analyticsadmin.googleapis.com/v1beta"}/properties/${encodeURIComponent(propertyId)}/dataStreams/${encodeURIComponent(streamId)}`, connectionId),
    ]);
    const account = { resourceName: String(propertyValue.parent ?? ""), accountId: resourceId(String(propertyValue.parent ?? ""), "accounts/"), displayName: String(propertyValue.parent ?? "") };
    const property = normalizePropertyPage({ properties: [propertyValue] }, [account]).properties[0] ?? null;
    const stream = normalizeStreamPage({ dataStreams: [streamValue] }).streams[0] ?? null;
    const match = domainMatchState(siteDomain, stream?.defaultUri ?? null);
    return { valid: Boolean(property && stream && stream.streamType === "web" && isAcceptedDomainMatch(match.state)), matchState: match.state, siteDomain: match.siteHost, streamHost: match.streamHost, property, stream, reason: property && stream ? match.reason : "The selected property or web stream could not be read." };
  }

  async fetchCoreReport(connectionId: string, query: Ga4CoreQuery): Promise<Ga4CoreResult> {
    const value = await this.getJson(`${this.options.dataApiBaseUrl ?? "https://analyticsdata.googleapis.com/v1beta"}/properties/${encodeURIComponent(query.propertyId)}:runReport`, connectionId, "POST", {
      dateRanges: [{ startDate: query.startDate, endDate: query.endDate }],
      dimensions: query.dimensions.map((name) => ({ name })),
      metrics: query.metrics.map((name) => ({ name: toProviderMetric(name) })),
      limit: String(query.limit ?? 10_000),
      offset: String(query.offset ?? 0),
      returnPropertyQuota: true,
    });
    const property = await this.getJson(`${this.options.adminApiBaseUrl ?? "https://analyticsadmin.googleapis.com/v1beta"}/properties/${encodeURIComponent(query.propertyId)}`, connectionId).catch(() => ({} as Record<string, unknown>));
    return normalizeCoreReport(value, query, property.timeZone == null ? null : String(property.timeZone));
  }

  async fetchRealtimeReport(connectionId: string, query: Ga4RealtimeQuery): Promise<Ga4RealtimeResult> {
    const value = await this.getJson(`${this.options.dataApiBaseUrl ?? "https://analyticsdata.googleapis.com/v1beta"}/properties/${encodeURIComponent(query.propertyId)}:runRealtimeReport`, connectionId, "POST", {
      dimensions: [{ name: "dateMinute" }],
      metrics: query.metrics.map((name) => ({ name: toProviderMetric(name) })),
      minuteRanges: [{ name: `last_${query.minuteRange}_minutes`, startMinutesAgo: query.minuteRange, endMinutesAgo: 0 }],
      returnPropertyQuota: true,
    });
    return normalizeRealtimeReport(value, query);
  }

  async refreshAccessToken(connectionId: string): Promise<Ga4TokenRefreshResult> {
    const credentials = await this.options.credentials.getCredential(connectionId);
    if (!credentials) throw new Error("reauthorization_required");
    try {
      const json = await this.requestToken({ grant_type: "refresh_token", refresh_token: credentials.refreshToken, client_id: this.options.clientId, client_secret: this.options.clientSecret });
      const scopes = parseGrantedScopes(json.scope as string | undefined);
      const grantedScopes = scopes.length ? scopes : credentials.grantedScopes;
      if (!hasReadOnlyAnalyticsScope(grantedScopes)) throw new Error("invalid_scope");
      const result = { accessToken: String(json.access_token ?? ""), expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000), refreshToken: json.refresh_token ? String(json.refresh_token) : null, grantedScopes };
      await this.options.credentials.saveAccessToken(connectionId, result.accessToken, result.expiresAt);
      if (result.refreshToken) await this.options.credentials.saveRefreshToken(connectionId, result.refreshToken, grantedScopes, credentials.googleSubject, credentials.grantIdentity);
      await this.options.credentials.recordRefreshSuccess(connectionId, new Date());
      return result;
    } catch (error) {
      const code = error instanceof Error ? error.message : "token_refresh_failed";
      await this.options.credentials.recordRefreshFailure(connectionId, code, new Date()).catch(() => undefined);
      if (["invalid_grant", "reauthorization_required", "invalid_scope"].includes(code)) await this.options.credentials.markReauthorizationRequired(connectionId, code).catch(() => undefined);
      throw error;
    }
  }

  async revokeGrant(connectionId: string): Promise<void> {
    const credentials = await this.options.credentials.getCredential(connectionId);
    if (!credentials) return;
    const response = await (this.options.transport ?? new FetchGa4Transport()).request({ url: `${REVOKE_API}?token=${encodeURIComponent(credentials.refreshToken)}`, method: "POST", timeoutMs: this.options.requestTimeoutMs ?? 8000 });
    if (response.status >= 400 && response.status !== 404) throw new Error("grant_revoke_failed");
    await this.options.credentials.markRevoked(connectionId, new Date());
  }

  private async accessToken(connectionId: string): Promise<string> {
    const credentials = await this.options.credentials.getCredential(connectionId);
    if (!credentials) throw new Error("reauthorization_required");
    if (credentials.accessToken && credentials.accessTokenExpiresAt && credentials.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return credentials.accessToken;
    const refreshed = await this.refreshAccessToken(connectionId);
    return refreshed.accessToken;
  }

  private async getJson(url: string, connectionId: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<Record<string, unknown>> {
    const token = await this.accessToken(connectionId);
    const response = await (this.options.transport ?? new FetchGa4Transport()).request({ url, method, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, timeoutMs: this.options.requestTimeoutMs ?? 8000 });
    if (response.status >= 400) {
      const code = parseGoogleError(response.body) ?? `provider_http_${response.status}`;
      if (response.status === 401) await this.options.credentials.markReauthorizationRequired(connectionId, code).catch(() => undefined);
      if (retryableGoogleStatus(response.status)) throw new Error(`retryable:${code}`);
      throw new Error(code);
    }
    try { return JSON.parse(response.body) as Record<string, unknown>; } catch { throw new Error("malformed_provider_response"); }
  }

  private async requestToken(params: Record<string, string>): Promise<Record<string, unknown>> {
    const response = await (this.options.transport ?? new FetchGa4Transport()).request({ url: TOKEN_API, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(params).toString(), timeoutMs: this.options.requestTimeoutMs ?? 8000 });
    if (response.status >= 400) throw new Error(parseGoogleError(response.body) ?? "token_request_failed");
    try { return JSON.parse(response.body) as Record<string, unknown>; } catch { throw new Error("malformed_token_response"); }
  }
}

export class FetchGa4Transport implements Ga4Transport {
  async request(input: Parameters<Ga4Transport["request"]>[0]): Promise<Awaited<ReturnType<Ga4Transport["request"]>>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetch(input.url, { method: input.method, headers: input.headers, body: input.body, signal: controller.signal, cache: "no-store" });
      return { status: response.status, headers: response.headers, body: await response.text() };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("provider_timeout");
      throw new Error("provider_transport_failed");
    } finally { clearTimeout(timeout); }
  }
}

function parseGoogleError(body: string): string | null {
  try { const value = JSON.parse(body) as { error?: { status?: string; message?: string } }; return value.error?.status ?? value.error?.message ?? null; } catch { return null; }
}

function decodeIdTokenSubject(value: string): string | null {
  try { const payload = value.split(".")[1]; if (!payload) return null; const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string }; return json.sub ?? null; } catch { return null; }
}

function toProviderMetric(metric: string): string {
  return ({ active_users: "activeUsers", recent_active_users: "activeUsers", sessions: "sessions", screen_page_views: "screenPageViews", engaged_sessions: "engagedSessions", engagement_rate: "engagementRate", average_session_duration: "averageSessionDuration", user_engagement_duration: "userEngagementDuration", key_events: "keyEvents", event_count: "eventCount" } as Record<string, string>)[metric] ?? metric;
}

type CursorState = { accountIndex: number; accountPageToken: string | null; propertyPageToken: string | null };
function encodeCursor(value: CursorState): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor(value: string | undefined): CursorState { if (!value) return { accountIndex: 0, accountPageToken: null, propertyPageToken: null }; try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CursorState; } catch { return { accountIndex: 0, accountPageToken: null, propertyPageToken: null }; } }
