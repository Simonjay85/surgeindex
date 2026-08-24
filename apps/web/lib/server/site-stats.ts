import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { getPostgresDb, sitePageMetricCurrent, siteRevenueCurrent } from "@surge/db";

export type PageMetric = {
  pathname: string;
  activeNow: number;
  activeSessions: number;
  visitors24h: number;
  visitors7d: number;
  pageviews24h: number;
  sessions24h: number;
  engagedSessions24h: number;
  engagementRate: number | null;
  avgEngagementSeconds: number | null;
  lastAcceptedEventAt: string | null;
  updatedAt: string;
};

export type RevenueMetric = {
  source: "woocommerce" | "stripe_boost";
  currency: string;
  grossAmountCents: number | null;
  refundedAmountCents: number | null;
  netAmountCents: number | null;
  orderCount: number | null;
  lastOrderAt: string | null;
  lastSyncedAt: string | null;
  status: "connected" | "stale" | "unavailable" | "error";
  publicVisible: boolean;
};

export type SiteRevenueSummary = {
  sales: RevenueMetric;
  boost: RevenueMetric;
};

function unavailable(source: RevenueMetric["source"]): RevenueMetric {
  return {
    source,
    currency: "USD",
    grossAmountCents: null,
    refundedAmountCents: null,
    netAmountCents: null,
    orderCount: null,
    lastOrderAt: null,
    lastSyncedAt: null,
    status: "unavailable",
    publicVisible: false,
  };
}

function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

/** Page-level aggregates, intentionally limited to a safe server-side projection. */
export async function getSitePageMetrics(siteId: string, limit = 100): Promise<PageMetric[]> {
  const db = getPostgresDb();
  const rows = await db
    .select()
    .from(sitePageMetricCurrent)
    .where(eq(sitePageMetricCurrent.siteId, siteId))
    .orderBy(desc(sitePageMetricCurrent.pageviews24h), desc(sitePageMetricCurrent.visitors24h), sitePageMetricCurrent.pathname)
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((row) => ({
    pathname: row.pathname,
    activeNow: row.activeNow,
    activeSessions: row.activeSessions,
    visitors24h: row.visitors24h,
    visitors7d: row.visitors7d,
    pageviews24h: row.pageviews24h,
    sessions24h: row.sessions24h,
    engagedSessions24h: row.engagedSessions24h,
    engagementRate: row.engagementRate == null ? null : Number(row.engagementRate),
    avgEngagementSeconds: row.avgEngagementSeconds,
    lastAcceptedEventAt: row.lastAcceptedEventAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function getBoostRevenue(siteIds: string[]): Promise<Map<string, RevenueMetric>> {
  const result = new Map<string, RevenueMetric>();
  if (!siteIds.length) return result;
  const db = getPostgresDb();
  const rows = await db.execute(sql`
    select
      c.site_id,
      o.currency,
      coalesce(sum(greatest(o.paid_amount_cents - o.refunded_amount_cents, 0)), 0)::int as net_amount_cents,
      coalesce(sum(o.paid_amount_cents), 0)::int as gross_amount_cents,
      coalesce(sum(o.refunded_amount_cents), 0)::int as refunded_amount_cents,
      count(*) filter (where o.paid_amount_cents > 0)::int as order_count,
      max(o.paid_at) as last_order_at
    from boost_order o
    inner join boost_campaign c on c.id = o.campaign_id
    where c.site_id in (${sql.join(siteIds.map((siteId) => sql`${siteId}::uuid`), sql`, `)})
      and c.is_demo = false
      and o.stripe_environment = 'live'
      and o.payment_status in ('succeeded', 'partially_refunded', 'refunded')
    group by c.site_id, o.currency
  `);
  for (const row of rows.rows as Array<Record<string, unknown>>) {
    const siteId = String(row.site_id);
    result.set(siteId, {
      source: "stripe_boost",
      currency: String(row.currency ?? "USD").toUpperCase(),
      grossAmountCents: asNumber(row.gross_amount_cents),
      refundedAmountCents: asNumber(row.refunded_amount_cents),
      netAmountCents: asNumber(row.net_amount_cents),
      orderCount: asNumber(row.order_count),
      lastOrderAt: row.last_order_at ? new Date(String(row.last_order_at)).toISOString() : null,
      lastSyncedAt: new Date().toISOString(),
      status: "connected",
      publicVisible: false,
    });
  }
  return result;
}

export async function getSiteRevenueSummaries(siteIds: string[], publicOnly = false): Promise<Map<string, SiteRevenueSummary>> {
  const uniqueSiteIds = Array.from(new Set(siteIds));
  const summaries = new Map<string, SiteRevenueSummary>();
  if (!uniqueSiteIds.length) return summaries;
  const db = getPostgresDb();
  const rows = await db
    .select()
    .from(siteRevenueCurrent)
    .where(inArray(siteRevenueCurrent.siteId, uniqueSiteIds));
  const boost = await getBoostRevenue(uniqueSiteIds);
  for (const siteId of uniqueSiteIds) {
    const salesRow = rows.find((row) => row.siteId === siteId && row.source === "woocommerce");
    const sales: RevenueMetric = salesRow
      ? {
          source: "woocommerce",
          currency: salesRow.currency.toUpperCase(),
          grossAmountCents: salesRow.grossAmountCents,
          refundedAmountCents: salesRow.refundedAmountCents,
          netAmountCents: salesRow.netAmountCents,
          orderCount: salesRow.orderCount,
          lastOrderAt: salesRow.lastOrderAt?.toISOString() ?? null,
          lastSyncedAt: salesRow.lastSyncedAt?.toISOString() ?? null,
          status: salesRow.status,
          publicVisible: salesRow.publicVisible,
        }
      : unavailable("woocommerce");
    const boostMetric = boost.get(siteId) ?? unavailable("stripe_boost");
    summaries.set(siteId, {
      sales: publicOnly && !sales.publicVisible ? unavailable("woocommerce") : sales,
      boost: publicOnly && !boostMetric.publicVisible ? unavailable("stripe_boost") : boostMetric,
    });
  }
  return summaries;
}

export async function getSiteRevenueSummary(siteId: string, publicOnly = false): Promise<SiteRevenueSummary> {
  return (await getSiteRevenueSummaries([siteId], publicOnly)).get(siteId) ?? {
    sales: unavailable("woocommerce"),
    boost: unavailable("stripe_boost"),
  };
}

export function formatRevenue(metric: RevenueMetric): string {
  if (metric.netAmountCents == null || metric.status === "unavailable" || metric.status === "error") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: metric.currency, maximumFractionDigits: 2 }).format(metric.netAmountCents / 100);
}
