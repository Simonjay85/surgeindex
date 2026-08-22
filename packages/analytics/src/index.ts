import { DemoAnalyticsProvider } from "./demo-provider.js";
import { TinybirdAnalyticsProvider } from "./tinybird-provider.js";
import type { AnalyticsProvider } from "./types.js";

export * from "./types.js";
export { DemoAnalyticsProvider, TinybirdAnalyticsProvider };

let cached: AnalyticsProvider | null = null;

/** Select the analytics provider from environment configuration. */
export function getAnalyticsProvider(): AnalyticsProvider {
  if (cached) return cached;
  const url = process.env.TINYBIRD_API_URL;
  const ingestToken = process.env.TINYBIRD_INGEST_TOKEN;
  const readToken = process.env.TINYBIRD_READ_TOKEN;
  if (url && ingestToken && readToken) {
    cached = new TinybirdAnalyticsProvider({ apiUrl: url, ingestToken, readToken });
  } else {
    cached = new DemoAnalyticsProvider();
  }
  return cached;
}
