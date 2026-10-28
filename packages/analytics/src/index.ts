import { DemoAnalyticsProvider } from "./demo-provider";
import { TinybirdAnalyticsProvider, TinybirdEventStoreProvider } from "./tinybird-provider";
import { PostgresAnalyticsProvider, PostgresEventStoreProvider } from "./postgres-provider";
import { getServerEnv } from "@surge/config";
import type { AnalyticsProvider } from "./types";

export * from "./types";
export { DemoAnalyticsProvider, TinybirdAnalyticsProvider, TinybirdEventStoreProvider, PostgresAnalyticsProvider, PostgresEventStoreProvider };

let cached: AnalyticsProvider | null = null;

/** Select the analytics provider from environment configuration. */
export function getAnalyticsProvider(): AnalyticsProvider {
  if (cached) return cached;
  const env = getServerEnv();
  if (env.ANALYTICS_PROVIDER === "tinybird") {
    cached = new TinybirdAnalyticsProvider({ apiUrl: env.TINYBIRD_API_URL!, ingestToken: env.TINYBIRD_INGEST_TOKEN!, readToken: env.TINYBIRD_READ_TOKEN! });
  } else {
    cached = new PostgresAnalyticsProvider();
  }
  return cached;
}
