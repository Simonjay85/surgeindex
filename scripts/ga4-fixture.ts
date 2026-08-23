import { FixtureGa4Provider, domainMatchState, isAcceptedDomainMatch } from "@surge/ga4";

async function main() {
  const provider = new FixtureGa4Provider();
  const exchange = await provider.exchangeAuthorizationCode({ code: "fixture-code", codeVerifier: "fixture-verifier-01234567890123456789" });
  const first = await provider.listAccountsAndProperties("fixture-connection");
  const second = first.nextPageToken ? await provider.listAccountsAndProperties("fixture-connection", first.nextPageToken) : null;
  const streams = await provider.listWebStreams("fixture-connection", "123456789");
  const validation = await provider.validateProperty("fixture-connection", "123456789", "111111", "example.com");
  const report = await provider.fetchCoreReport("fixture-connection", { propertyId: "123456789", startDate: "2026-08-22", endDate: "2026-08-22", dimensions: ["date"], metrics: ["active_users", "sessions", "screen_page_views"] });
  const realtime = await provider.fetchRealtimeReport("fixture-connection", { propertyId: "123456789", minuteRange: 30, metrics: ["recent_active_users", "screen_page_views", "event_count", "key_events"] });
  console.log(JSON.stringify({ provider: "fixture", readOnlyScope: exchange.grantedScopes, propertyPages: [first.properties.length, second?.properties.length ?? 0], webStreams: streams.streams.filter((stream) => stream.streamType === "web").length, domainMatch: validation.matchState, acceptedDomainMatch: isAcceptedDomainMatch(domainMatchState("example.com", "https://example.com").state), coreRows: report.rows.length, realtimeActiveUsers: realtime.activeUsers }, null, 2));
}

void main();
