import "server-only";

import type { ActivityItem, BreakoutItem, CategoryInfo, PlatformStats, TimeseriesPoint } from "@surge/shared";
import type { DemoSite } from "../demo-data";
import {
  findSiteById,
  findPublicSiteBySlug,
  getRankHistory as getDbRankHistory,
  getSnapshots,
  listActivity,
  listActivityForUser,
  listBreakoutSites,
  listCategories,
  listNewPublicSites,
  listPublicSites,
  listSitesForOwner,
  type RepositorySite,
} from "@surge/db";
import { getPostgresDb } from "@surge/db";
import { getServerEnv } from "@surge/config";
import { TinybirdAnalyticsProvider } from "@surge/analytics";
import {
  DEMO_SITES,
  getActivity as getDemoActivity,
  getBreakouts as getDemoBreakouts,
  getCategories as getDemoCategories,
  getLeaderboard as getDemoLeaderboard,
  getPlatformStats as getDemoPlatformStats,
  getRelatedSites as getDemoRelatedSites,
  getSite as getDemoSite,
  getTimeseries as getDemoTimeseries,
} from "../demo-data";

export interface PublicDataProvider {
  readonly source: "demo" | "postgres" | "tinybird";
  getLeaderboard(input: { window: string; category?: string; query?: string; limit?: number }): Promise<DemoSite[]>;
  getSite(slug: string): Promise<DemoSite | undefined>;
  getSiteById(siteId: string): Promise<DemoSite | undefined>;
  getOwnedSites(userId: string): Promise<DemoSite[]>;
  getOwnedSite(userId: string, siteId: string): Promise<DemoSite | undefined>;
  getRelatedSites(slug: string): Promise<DemoSite[]>;
  getTimeseries(slug: string, metric?: "visitors" | "active" | "pageviews" | "referrals"): Promise<TimeseriesPoint[]>;
  getRankHistory(slug: string): Promise<Array<{ period: string; rank: number; heat: number }>>;
  getCategories(): Promise<CategoryInfo[]>;
  getActivity(): Promise<ActivityItem[]>;
  getOwnedActivity(userId: string): Promise<ActivityItem[]>;
  getBreakouts(): Promise<BreakoutItem[]>;
  getPlatformStats(): Promise<PlatformStats>;
}

function zeroBreakdown() {
  return { growthVelocity: 0, liveAcceleration: 0, trafficVolume: 0, engagementQuality: 0, trustConfidence: 0 };
}

function mapRepositorySite(row: RepositorySite): DemoSite {
  const current = row.current;
  const rank = row.rank?.rank ?? 0;
  const previousRank = row.rank?.previousRank ?? null;
  const verification = row.verification;
  return {
    siteId: row.id,
    slug: row.slug,
    domain: row.domain,
    name: row.name,
    description: row.description,
    categorySlug: row.categorySlug,
    categoryName: row.categoryName,
    verification,
    ownership: row.ownership,
    status: row.status,
    rank,
    previousRank,
    rankMovement: previousRank != null && rank > 0 ? previousRank - rank : 0,
    heatScore: current?.heatScore ?? 0,
    activeNow: current?.activeNow ?? null,
    activeSource: current?.activeNow != null ? (verification === "unverified" ? null : verification) : null,
    visitors: current?.visitors24h ?? null,
    growthPct: current?.growth24hPct ?? null,
    surgeReferrals: current?.surgeReferrals24h ?? 0,
    sparkline: [],
    lastUpdatedAt: (current?.updatedAt ?? row.createdAt).toISOString(),
    isDemo: false,
    baselineDailyVisitors: current?.baselineDailyVisitors ?? null,
    typicalActiveNow: current?.typicalActiveNow ?? null,
    engagementRate: current?.engagementRate ?? null,
    avgEngagementSeconds: current?.avgEngagementSeconds ?? null,
    sessions24h: current?.sessions24h ?? null,
    visitors7d: current?.visitors7d ?? null,
    engagedSessions24h: current?.engagedSessions24h ?? null,
    activeSessions: current?.activeSessions ?? null,
    pageviews24h: current?.pageviews24h ?? null,
    surgeAttributedVisits24h: current?.surgeAttributedVisits24h ?? 0,
    surgeAttributedEngagedVisits24h: current?.surgeAttributedEngagedVisits24h ?? 0,
    lastAcceptedEventAt: current?.lastAcceptedEventAt?.toISOString() ?? null,
    lastDetectedOrigin: current?.lastDetectedOrigin ?? null,
    trackerVersion: current?.trackerVersion ?? null,
    acceptedEvents24h: current?.acceptedEvents24h ?? 0,
    suspectedEvents24h: current?.suspectedEvents24h ?? 0,
    invalidEvents24h: current?.invalidEvents24h ?? 0,
    fraudPenalty: 0,
    domainOwnershipVerified: row.ownership === "claimed",
    createdAt: row.createdAt.toISOString().slice(0, 10),
    breakoutMultiple: current?.growth24hPct != null ? Math.max(1, 1 + current.growth24hPct / 100) : 0,
    league: current?.heatLeague === "established" || current?.heatLeague === "emerging" ? current.heatLeague : "new",
    heatBreakdown: zeroBreakdown(),
    heatNotes: current ? ["Production score is read from the persisted metric current row."] : ["No verified traffic yet."],
    tags: [],
  };
}

function mapDemoSite(site: DemoSite): DemoSite {
  return site;
}

function mapActivity(item: Awaited<ReturnType<typeof listActivity>>[number]): ActivityItem {
  return {
    id: item.id,
    type: item.type as ActivityItem["type"],
    siteSlug: item.siteSlug,
    siteName: item.siteName,
    domain: item.domain,
    detail: item.detail,
    occurredAt: item.occurredAt.toISOString(),
    isDemo: false,
  };
}

class DemoPublicDataProvider implements PublicDataProvider {
  readonly source = "demo" as const;
  async getLeaderboard(input: { window: string; category?: string; query?: string; limit?: number }) {
    return getDemoLeaderboard(input.window, input.category ?? "all", input.query).slice(0, input.limit ?? 50).map(mapDemoSite);
  }
  async getSite(slug: string) { return getDemoSite(slug); }
  async getSiteById(siteId: string) { return DEMO_SITES.find((site) => site.siteId === siteId); }
  async getOwnedSites(userId: string) { void userId; return getDemoLeaderboard("live").filter((site) => site.ownership === "claimed").slice(0, 3); }
  async getOwnedSite(userId: string, siteId: string) { return (await this.getOwnedSites(userId)).find((site) => site.siteId === siteId); }
  async getRelatedSites(slug: string) { return getDemoRelatedSites(slug); }
  async getTimeseries(slug: string, metric: "visitors" | "active" | "pageviews" | "referrals" = "visitors") { return getDemoTimeseries(slug, metric); }
  async getRankHistory(slug: string) { return (await import("../demo-data")).getRankHistory(slug); }
  async getCategories() { return getDemoCategories(); }
  async getActivity() { return getDemoActivity(); }
  async getOwnedActivity(userId: string) { void userId; return getDemoActivity(); }
  async getBreakouts() { return getDemoBreakouts(); }
  async getPlatformStats() { return getDemoPlatformStats(); }
}

class PostgresPublicDataProvider implements PublicDataProvider {
  readonly source: "postgres" | "tinybird" = "postgres";
  protected readonly db = getPostgresDb();

  async getLeaderboard(input: { window: string; category?: string; query?: string; limit?: number }) {
    const limit = input.limit ?? 50;
    const rows = input.window === "new"
      ? await listNewPublicSites(this.db, limit, input.category, input.query)
      : input.window === "breakout"
        ? await listBreakoutSites(this.db, limit, input.category, input.query)
        : await listPublicSites(this.db, { categorySlug: input.category, query: input.query, limit: Math.max(limit, 100) });
    const mapped = rows.map(mapRepositorySite);
    if (input.window === "breakout") return mapped;
    if (input.window === "new") return mapped;
    return mapped
      .sort((a, b) => (b.heatScore - a.heatScore) || (b.visitors ?? -1) - (a.visitors ?? -1))
      .slice(0, limit)
      .map((site) => ({ ...site, rank: site.rank }));
  }

  async getSite(slug: string) {
    const row = await findPublicSiteBySlug(this.db, slug);
    return row ? mapRepositorySite(row) : undefined;
  }

  async getSiteById(siteId: string) {
    const row = await findSiteById(this.db, siteId);
    return row ? mapRepositorySite(row) : undefined;
  }

  async getOwnedSites(userId: string) {
    return (await listSitesForOwner(this.db, userId)).map(mapRepositorySite);
  }

  async getOwnedSite(userId: string, siteId: string) {
    return (await this.getOwnedSites(userId)).find((site) => site.siteId === siteId);
  }

  async getRelatedSites(slug: string) {
    const current = await this.getSite(slug);
    if (!current) return [];
    const rows = await listPublicSites(this.db, { categorySlug: current.categorySlug, limit: 12 });
    return rows.filter((row) => row.slug !== slug).slice(0, 4).map(mapRepositorySite);
  }

  async getTimeseries(slug: string, metric = "visitors") {
    const current = await findPublicSiteBySlug(this.db, slug);
    if (!current) return [];
    const rows = await getSnapshots(this.db, current.id, 24);
    return rows.reverse().map((row) => ({
      t: row.capturedAt.toISOString(),
      value: metric === "active" ? row.activeNow : metric === "pageviews" ? row.pageviews : metric === "referrals" ? row.attributedVisits : row.visitors,
    }));
  }

  async getRankHistory(slug: string) {
    const current = await findPublicSiteBySlug(this.db, slug);
    if (!current) return [];
    const rows = await getDbRankHistory(this.db, current.id, 12);
    return rows.reverse().map((row) => ({ period: row.capturedAt.toISOString().slice(0, 10), rank: row.rank, heat: current.current?.heatScore ?? 0 }));
  }

  async getCategories() {
    const rows = await listCategories(this.db);
    return rows.map((row) => ({ ...row }));
  }

  async getActivity() {
    return (await listActivity(this.db)).map(mapActivity);
  }

  async getOwnedActivity(userId: string) {
    return (await listActivityForUser(this.db, userId)).map(mapActivity);
  }

  async getBreakouts() {
    const rows = await listBreakoutSites(this.db, 50);
    return rows.map((row) => {
      const site = mapRepositorySite(row);
      const current = row.current;
      const multiple = current?.growth24hPct == null ? 0 : Math.max(1, 1 + current.growth24hPct / 100);
      return {
        siteId: site.siteId,
        slug: site.slug,
        domain: site.domain,
        name: site.name,
        categoryName: site.categoryName,
        categorySlug: site.categorySlug,
        verification: site.verification,
        multiple,
        currentVolume: current?.visitors24h ?? 0,
        baselineVolume: current?.baselineDailyVisitors ?? 0,
        detectedAt: (current?.updatedAt ?? row.createdAt).toISOString(),
        confidence: multiple >= 4 ? "high" : multiple >= 2 ? "medium" : "low",
        explanation: "Growth is derived from the persisted site metric current row.",
        sparkline: site.sparkline,
        isDemo: false,
      } satisfies BreakoutItem;
    });
  }

  async getPlatformStats() {
    const sites = await listPublicSites(this.db, { limit: 5000 });
    const verified = sites.filter((site) => site.verification !== "unverified");
    return {
      sitesTracked: sites.length,
      peopleActiveNow: sites.reduce((sum, site) => sum + (site.current?.activeNow ?? 0), 0),
      breakoutSignalsToday: (await listBreakoutSites(this.db, 5000)).length,
      verifiedSites: verified.length,
      isDemo: false,
    } satisfies PlatformStats;
  }
}

/**
 * Tinybird owns the traffic aggregates when ANALYTICS_PROVIDER=tinybird.
 * Site metadata, ownership, categories, and activity remain in Postgres, but
 * this adapter never reads Postgres tracker aggregates as a silent fallback.
 */
class TinybirdPublicDataProvider extends PostgresPublicDataProvider {
  readonly source = "tinybird" as const;
  private readonly analytics = new TinybirdAnalyticsProvider({
    apiUrl: getServerEnv().TINYBIRD_API_URL!,
    ingestToken: getServerEnv().TINYBIRD_INGEST_TOKEN!,
    readToken: getServerEnv().TINYBIRD_READ_TOKEN!,
  });

  private async enrich(row: RepositorySite): Promise<DemoSite> {
    const site = mapRepositorySite(row);
    const [metrics24h, metrics7d] = await Promise.all([
      this.analytics.getSiteMetrics(row.id, "24h"),
      this.analytics.getSiteMetrics(row.id, "7d"),
    ]);
    return {
      ...site,
      activeNow: metrics24h.activeNow,
      activeSource: site.verification === "unverified" ? null : site.verification,
      visitors: metrics24h.visitors,
      visitors7d: metrics7d.visitors,
      sessions24h: metrics24h.sessions ?? null,
      engagedSessions24h: metrics24h.engagedSessions ?? null,
      pageviews24h: metrics24h.pageviews,
      engagementRate: metrics24h.engagementRate,
      avgEngagementSeconds: metrics24h.avgEngagementSeconds,
      activeSessions: metrics24h.activeSessions ?? null,
      surgeAttributedVisits24h: metrics24h.attributedVisits ?? site.surgeAttributedVisits24h,
      surgeAttributedEngagedVisits24h: metrics24h.attributedEngagedVisits ?? site.surgeAttributedEngagedVisits24h,
      lastUpdatedAt: metrics24h.generatedAt,
      heatNotes: ["Traffic metrics are read from the selected Tinybird provider; Batch 3 does not calibrate Heat Score."],
    };
  }

  async getLeaderboard(input: { window: string; category?: string; query?: string; limit?: number }) {
    const limit = input.limit ?? 50;
    const rows = input.window === "new"
      ? await listNewPublicSites(this.db, limit, input.category, input.query)
      : input.window === "breakout"
        ? await listBreakoutSites(this.db, limit, input.category, input.query)
        : await listPublicSites(this.db, { categorySlug: input.category, query: input.query, limit: Math.max(limit, 100) });
    const mapped = await Promise.all(rows.map((row) => this.enrich(row)));
    if (input.window === "new" || input.window === "breakout") return mapped.slice(0, limit);
    return mapped
      .sort((a, b) => (b.visitors ?? -1) - (a.visitors ?? -1) || (b.activeNow ?? -1) - (a.activeNow ?? -1))
      .slice(0, limit);
  }

  async getSite(slug: string) {
    const row = await findPublicSiteBySlug(this.db, slug);
    return row ? this.enrich(row) : undefined;
  }

  async getSiteById(siteId: string) {
    const row = await findSiteById(this.db, siteId);
    return row ? this.enrich(row) : undefined;
  }

  async getOwnedSites(userId: string) {
    return Promise.all((await listSitesForOwner(this.db, userId)).map((row) => this.enrich(row)));
  }

  async getOwnedSite(userId: string, siteId: string) {
    return (await this.getOwnedSites(userId)).find((site) => site.siteId === siteId);
  }

  async getRelatedSites(slug: string) {
    const current = await findPublicSiteBySlug(this.db, slug);
    if (!current) return [];
    const rows = await listPublicSites(this.db, { categorySlug: current.categorySlug ?? undefined, limit: 12 });
    return Promise.all(rows.filter((row) => row.slug !== slug).slice(0, 4).map((row) => this.enrich(row)));
  }

  async getTimeseries(slug: string, metric: "visitors" | "active" | "pageviews" | "referrals" = "visitors") {
    const current = await findPublicSiteBySlug(this.db, slug);
    if (!current) return [];
    return this.analytics.getTimeSeries(current.id, { window: "24h", metric });
  }
}

let cached: PublicDataProvider | null = null;

export function getPublicDataProvider(): PublicDataProvider {
  if (cached) return cached;
  const env = getServerEnv();
  cached = env.DATA_PROVIDER === "demo"
    ? new DemoPublicDataProvider()
    : env.ANALYTICS_PROVIDER === "tinybird"
      ? new TinybirdPublicDataProvider()
      : new PostgresPublicDataProvider();
  return cached;
}

export function resetPublicDataProvider(): void {
  cached = null;
}

export function isProductionDataProvider(): boolean {
  return getServerEnv().DATA_PROVIDER === "postgres";
}
