import { computeHeatScore, type HeatScoreResult } from "@surge/scoring";
import type {
  ActivityItem,
  BreakoutItem,
  CategoryInfo,
  DataSource,
  LeaderboardEntry,
  PlatformStats,
  SponsoredCard,
  TimeseriesPoint,
  VerificationStatus,
} from "@surge/shared";
import { CATEGORIES, dataSourceLabel, formatCount } from "@surge/shared";

export const DEMO_NOW = "2026-08-23T10:30:00.000Z";
const DATA_UPDATED_AT = "2026-08-23T10:27:00.000Z";

export interface DemoSite extends LeaderboardEntry {
  baselineDailyVisitors: number | null;
  typicalActiveNow: number | null;
  engagementRate: number | null;
  avgEngagementSeconds: number | null;
  sessions24h: number | null;
  visitors7d: number | null;
  engagedSessions24h: number | null;
  activeSessions: number | null;
  pageviews24h: number | null;
  surgeAttributedVisits24h: number;
  surgeAttributedEngagedVisits24h: number;
  lastAcceptedEventAt: string | null;
  lastDetectedOrigin: string | null;
  trackerVersion: string | null;
  acceptedEvents24h: number;
  suspectedEvents24h: number;
  invalidEvents24h: number;
  fraudPenalty: number;
  domainOwnershipVerified: boolean;
  createdAt: string;
  breakoutMultiple: number;
  league: "new" | "emerging" | "established";
  heatBreakdown: HeatScoreResult["breakdown"];
  heatNotes: string[];
  tags: string[];
}

type SiteSeed = {
  siteId: string;
  slug: string;
  domain: string;
  name: string;
  description: string;
  categorySlug: string;
  categoryName: string;
  verification: VerificationStatus;
  ownership: DemoSite["ownership"];
  status: DemoSite["status"];
  baselineDailyVisitors: number | null;
  typicalActiveNow: number | null;
  engagementRate: number | null;
  avgEngagementSeconds: number | null;
  fraudPenalty: number;
  domainOwnershipVerified: boolean;
  previousRank: number;
  rankMovement: number;
  activeNow?: number | null;
  visitors?: number | null;
  growthPct?: number | null;
  surgeReferrals?: number;
  sparkline: number[];
  createdAt: string;
  breakoutMultiple: number;
  tags: string[];
};

function seed(input: SiteSeed): DemoSite {
  const result = computeHeatScore({
    visitors24h: input.visitors ?? null,
    baselineDailyVisitors: input.baselineDailyVisitors,
    activeNow: input.activeNow ?? null,
    typicalActiveNow: input.typicalActiveNow,
    engagementRate: input.engagementRate,
    avgEngagementSeconds: input.avgEngagementSeconds,
    verification: input.verification,
    dataFreshnessSeconds: 180,
    fraudPenalty: input.fraudPenalty,
    domainOwnershipVerified: input.domainOwnershipVerified,
  });

  return {
    ...input,
    rank: 0,
    previousRank: input.previousRank,
    rankMovement: input.rankMovement,
    heatScore: result.score,
    activeNow: input.activeNow ?? null,
    activeSource: input.verification === "unverified" ? null : input.verification,
    visitors: input.visitors ?? null,
    sessions24h: input.visitors == null ? null : Math.round(input.visitors * 0.8),
    visitors7d: input.visitors == null ? null : Math.round(input.visitors * 1.9),
    engagedSessions24h: input.engagementRate == null || input.visitors == null ? null : Math.round(input.visitors * 0.8 * input.engagementRate),
    activeSessions: input.activeNow ?? null,
    pageviews24h: input.visitors == null ? null : Math.round(input.visitors * 1.8),
    surgeAttributedVisits24h: 0,
    surgeAttributedEngagedVisits24h: 0,
    lastAcceptedEventAt: input.verification === "tracker" ? DATA_UPDATED_AT : null,
    lastDetectedOrigin: input.verification === "tracker" ? input.domain : null,
    trackerVersion: input.verification === "tracker" ? "demo" : null,
    acceptedEvents24h: input.verification === "tracker" ? Math.round((input.visitors ?? 0) * 2) : 0,
    suspectedEvents24h: 0,
    invalidEvents24h: 0,
    growthPct: input.growthPct ?? null,
    surgeReferrals: input.surgeReferrals ?? 0,
    lastUpdatedAt: DATA_UPDATED_AT,
    isDemo: true,
    league: result.league,
    heatBreakdown: result.breakdown,
    heatNotes: result.notes,
  };
}

const siteSeeds: SiteSeed[] = [
  { siteId: "site-launchpilot", slug: "launchpilot-ai", domain: "launchpilot.ai", name: "LaunchPilot", description: "A calm command center for shipping an AI product launch.", categorySlug: "ai-tools", categoryName: "AI Tools", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 21_400, typicalActiveNow: 260, engagementRate: 0.64, avgEngagementSeconds: 148, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 4, rankMovement: 3, activeNow: 842, visitors: 78_200, growthPct: 265, surgeReferrals: 1_261, sparkline: [31, 34, 38, 36, 44, 48, 54, 61, 59, 68, 74, 82], createdAt: "2026-05-16", breakoutMultiple: 5.4, tags: ["launches", "planning", "AI"] },
  { siteId: "site-pixelforge", slug: "pixelforge-studio", domain: "pixelforge.studio", name: "PixelForge", description: "Collaborative moodboards and production-ready design systems.", categorySlug: "design", categoryName: "Design", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 17_900, typicalActiveNow: 190, engagementRate: 0.72, avgEngagementSeconds: 176, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 1, rankMovement: 0, activeNow: 516, visitors: 93_700, growthPct: 44.5, surgeReferrals: 946, sparkline: [51, 54, 53, 56, 58, 61, 63, 64, 67, 66, 72, 75], createdAt: "2026-03-02", breakoutMultiple: 2.1, tags: ["moodboards", "systems", "teams"] },
  { siteId: "site-flowdesk", slug: "flowdesk-work", domain: "flowdesk.work", name: "Flowdesk", description: "One shared workspace for the work that usually gets lost in tabs.", categorySlug: "productivity", categoryName: "Productivity", verification: "ga4", ownership: "claimed", status: "active", baselineDailyVisitors: 31_000, typicalActiveNow: null, engagementRate: 0.58, avgEngagementSeconds: 132, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 2, rankMovement: -1, activeNow: null, visitors: 102_400, growthPct: 66.8, surgeReferrals: 738, sparkline: [45, 48, 52, 50, 56, 57, 62, 63, 69, 68, 74, 79], createdAt: "2026-02-11", breakoutMultiple: 2.7, tags: ["projects", "notes", "teams"] },
  { siteId: "site-querynest", slug: "querynest-dev", domain: "querynest.dev", name: "QueryNest", description: "A faster way to understand unfamiliar databases and APIs.", categorySlug: "developer-tools", categoryName: "Developer Tools", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 8_600, typicalActiveNow: 120, engagementRate: 0.69, avgEngagementSeconds: 205, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 8, rankMovement: 4, activeNow: 377, visitors: 44_100, growthPct: 188.2, surgeReferrals: 624, sparkline: [20, 22, 21, 29, 27, 35, 41, 40, 48, 55, 61, 67], createdAt: "2026-06-20", breakoutMultiple: 4.9, tags: ["SQL", "API", "docs"] },
  { siteId: "site-shopsignal", slug: "shopsignal-co", domain: "shopsignal.co", name: "ShopSignal", description: "See which products customers are actually searching for next.", categorySlug: "ecommerce", categoryName: "Ecommerce", verification: "ga4", ownership: "claimed", status: "active", baselineDailyVisitors: 11_500, typicalActiveNow: null, engagementRate: 0.61, avgEngagementSeconds: 119, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 6, rankMovement: 1, activeNow: null, visitors: 58_600, growthPct: 119.3, surgeReferrals: 512, sparkline: [29, 32, 35, 34, 39, 44, 42, 48, 51, 57, 55, 64], createdAt: "2026-04-09", breakoutMultiple: 3.8, tags: ["commerce", "demand", "research"] },
  { siteId: "site-promptharbor", slug: "promptharbor-com", domain: "promptharbor.com", name: "PromptHarbor", description: "Useful prompt patterns, organized for teams that ship.", categorySlug: "ai-tools", categoryName: "AI Tools", verification: "unverified", ownership: "unclaimed", status: "active", baselineDailyVisitors: null, typicalActiveNow: null, engagementRate: null, avgEngagementSeconds: null, fraudPenalty: 0, domainOwnershipVerified: false, previousRank: 12, rankMovement: 5, activeNow: null, visitors: null, growthPct: null, surgeReferrals: 384, sparkline: [10, 11, 14, 12, 18, 20, 21, 25, 28, 31, 30, 36], createdAt: "2026-08-19", breakoutMultiple: 6.2, tags: ["prompts", "library", "teams"] },
  { siteId: "site-stackbeacon", slug: "stackbeacon-io", domain: "stackbeacon.io", name: "StackBeacon", description: "The small observability layer for independent engineering teams.", categorySlug: "developer-tools", categoryName: "Developer Tools", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 6_800, typicalActiveNow: 72, engagementRate: 0.74, avgEngagementSeconds: 221, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 10, rankMovement: 2, activeNow: 205, visitors: 31_900, growthPct: 164.7, surgeReferrals: 433, sparkline: [19, 21, 23, 26, 25, 31, 35, 38, 43, 44, 51, 58], createdAt: "2026-07-03", breakoutMultiple: 4.3, tags: ["monitoring", "alerts", "infra"] },
  { siteId: "site-marketseo", slug: "marketmuseo", domain: "marketmuseo.com", name: "MarketMuseo", description: "A visual research room for finding the next category to own.", categorySlug: "marketing", categoryName: "Marketing", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 15_600, typicalActiveNow: 140, engagementRate: 0.62, avgEngagementSeconds: 165, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 5, rankMovement: -3, activeNow: 289, visitors: 49_700, growthPct: 28.6, surgeReferrals: 397, sparkline: [60, 59, 62, 64, 62, 61, 60, 58, 57, 55, 53, 52], createdAt: "2026-01-28", breakoutMultiple: 1.3, tags: ["research", "signals", "strategy"] },
  { siteId: "site-buildsprint", slug: "buildsprint-cc", domain: "buildsprint.cc", name: "BuildSprint", description: "Opinionated project rituals for teams who move without drama.", categorySlug: "saas", categoryName: "SaaS", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 9_200, typicalActiveNow: 88, engagementRate: 0.67, avgEngagementSeconds: 143, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 14, rankMovement: 5, activeNow: 221, visitors: 28_800, growthPct: 132.4, surgeReferrals: 361, sparkline: [22, 25, 25, 29, 31, 30, 36, 40, 44, 49, 53, 55], createdAt: "2026-06-29", breakoutMultiple: 3.2, tags: ["rituals", "planning", "teams"] },
  { siteId: "site-clipcraft", slug: "clipcraft-video", domain: "clipcraft.video", name: "ClipCraft", description: "Turn long recordings into a sharp set of short clips.", categorySlug: "media", categoryName: "Media", verification: "ga4", ownership: "unclaimed", status: "active", baselineDailyVisitors: 23_000, typicalActiveNow: null, engagementRate: 0.55, avgEngagementSeconds: 104, fraudPenalty: 0, domainOwnershipVerified: false, previousRank: 7, rankMovement: -2, activeNow: null, visitors: 64_300, growthPct: 39.7, surgeReferrals: 284, sparkline: [53, 55, 56, 55, 58, 57, 59, 61, 60, 62, 63, 64], createdAt: "2026-03-14", breakoutMultiple: 1.8, tags: ["video", "clips", "editing"] },
  { siteId: "site-orbitnotes", slug: "orbitnotes-app", domain: "orbitnotes.app", name: "OrbitNotes", description: "Notes that bring the right context back when you need it.", categorySlug: "productivity", categoryName: "Productivity", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 4_800, typicalActiveNow: 54, engagementRate: 0.71, avgEngagementSeconds: 189, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 19, rankMovement: 7, activeNow: 161, visitors: 22_600, growthPct: 246.2, surgeReferrals: 319, sparkline: [12, 13, 18, 17, 23, 26, 29, 33, 40, 42, 49, 56], createdAt: "2026-08-02", breakoutMultiple: 5.8, tags: ["notes", "context", "knowledge"] },
  { siteId: "site-cartmetric", slug: "cartmetric-store", domain: "cartmetric.store", name: "CartMetric", description: "Readable margin and merchandising signals for growing stores.", categorySlug: "ecommerce", categoryName: "Ecommerce", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 10_200, typicalActiveNow: 95, engagementRate: 0.59, avgEngagementSeconds: 138, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 11, rankMovement: -1, activeNow: 146, visitors: 35_400, growthPct: 49.2, surgeReferrals: 244, sparkline: [42, 43, 45, 46, 44, 48, 47, 50, 51, 50, 52, 53], createdAt: "2026-04-27", breakoutMultiple: 2.2, tags: ["retail", "margin", "merchandising"] },
  { siteId: "site-signalroom", slug: "signalroom-fm", domain: "signalroom.fm", name: "Signalroom", description: "A focused listening room for ideas worth sharing.", categorySlug: "media", categoryName: "Media", verification: "unverified", ownership: "unclaimed", status: "active", baselineDailyVisitors: null, typicalActiveNow: null, engagementRate: null, avgEngagementSeconds: null, fraudPenalty: 0, domainOwnershipVerified: false, previousRank: 0, rankMovement: 0, activeNow: null, visitors: null, growthPct: null, surgeReferrals: 102, sparkline: [7, 8, 8, 10, 11, 10, 13, 15, 14, 17, 19, 21], createdAt: "2026-08-21", breakoutMultiple: 4.6, tags: ["audio", "ideas", "publishing"] },
  { siteId: "site-copilotgrid", slug: "copilotgrid-ai", domain: "copilotgrid.ai", name: "CopilotGrid", description: "Compare everyday AI workflows before you commit to one.", categorySlug: "ai-tools", categoryName: "AI Tools", verification: "ga4", ownership: "claimed", status: "active", baselineDailyVisitors: 5_200, typicalActiveNow: null, engagementRate: 0.53, avgEngagementSeconds: 94, fraudPenalty: 0.06, domainOwnershipVerified: true, previousRank: 15, rankMovement: 1, activeNow: null, visitors: 17_800, growthPct: 112.3, surgeReferrals: 198, sparkline: [16, 18, 19, 22, 25, 24, 27, 30, 29, 35, 38, 41], createdAt: "2026-07-26", breakoutMultiple: 3.5, tags: ["AI", "workflows", "compare"] },
  { siteId: "site-revenueleaf", slug: "revenueleaf-com", domain: "revenueleaf.com", name: "RevenueLeaf", description: "A lighter operating view for subscription revenue teams.", categorySlug: "finance", categoryName: "Finance", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 7_100, typicalActiveNow: 67, engagementRate: 0.63, avgEngagementSeconds: 151, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 13, rankMovement: -2, activeNow: 83, visitors: 18_900, growthPct: 24.9, surgeReferrals: 176, sparkline: [40, 41, 40, 43, 43, 45, 46, 44, 45, 46, 47, 48], createdAt: "2026-02-25", breakoutMultiple: 1.5, tags: ["revenue", "finance", "saas"] },
  { siteId: "site-briefcase", slug: "briefcase-press", domain: "briefcase.press", name: "Briefcase", description: "A clean daily brief for people who run internet businesses.", categorySlug: "marketing", categoryName: "Marketing", verification: "tracker", ownership: "unclaimed", status: "active", baselineDailyVisitors: 3_900, typicalActiveNow: 33, engagementRate: 0.66, avgEngagementSeconds: 121, fraudPenalty: 0, domainOwnershipVerified: false, previousRank: 22, rankMovement: 6, activeNow: 72, visitors: 16_400, growthPct: 320.5, surgeReferrals: 144, sparkline: [9, 10, 12, 15, 17, 22, 25, 27, 33, 38, 40, 46], createdAt: "2026-08-08", breakoutMultiple: 6.7, tags: ["briefing", "business", "media"] },
  { siteId: "site-shipshape", slug: "shipshape-tools", domain: "shipshape.tools", name: "Shipshape", description: "Tiny QA checklists for teams that want fewer launch surprises.", categorySlug: "developer-tools", categoryName: "Developer Tools", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 3_300, typicalActiveNow: 29, engagementRate: 0.77, avgEngagementSeconds: 209, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 24, rankMovement: 8, activeNow: 54, visitors: 14_200, growthPct: 330.3, surgeReferrals: 131, sparkline: [8, 8, 10, 13, 16, 18, 20, 24, 27, 31, 35, 39], createdAt: "2026-08-06", breakoutMultiple: 5.1, tags: ["QA", "launch", "checklists"] },
  { siteId: "site-kindred-commerce", slug: "kindred-commerce", domain: "kindredcommerce.com", name: "Kindred Commerce", description: "Retention ideas for stores that want to feel more human.", categorySlug: "ecommerce", categoryName: "Ecommerce", verification: "unverified", ownership: "unclaimed", status: "active", baselineDailyVisitors: null, typicalActiveNow: null, engagementRate: null, avgEngagementSeconds: null, fraudPenalty: 0, domainOwnershipVerified: false, previousRank: 0, rankMovement: 0, activeNow: null, visitors: null, growthPct: null, surgeReferrals: 86, sparkline: [8, 9, 9, 12, 12, 14, 15, 16, 18, 20, 22, 23], createdAt: "2026-08-20", breakoutMultiple: 3.9, tags: ["retention", "retail", "community"] },
  { siteId: "site-plaintext", slug: "plaintext-studio", domain: "plaintext.studio", name: "Plaintext", description: "A writing room that keeps drafts moving and distractions out.", categorySlug: "productivity", categoryName: "Productivity", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 2_900, typicalActiveNow: 22, engagementRate: 0.73, avgEngagementSeconds: 183, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 21, rankMovement: -4, activeNow: 44, visitors: 8_900, growthPct: 12.3, surgeReferrals: 94, sparkline: [34, 34, 36, 35, 38, 39, 40, 39, 41, 40, 42, 43], createdAt: "2026-04-01", breakoutMultiple: 1.1, tags: ["writing", "focus", "drafts"] },
  { siteId: "site-hedgekit", slug: "hedgekit-finance", domain: "hedgekit.finance", name: "HedgeKit", description: "Plain-language scenario planning for independent investors.", categorySlug: "finance", categoryName: "Finance", verification: "ga4", ownership: "claimed", status: "active", baselineDailyVisitors: 4_100, typicalActiveNow: null, engagementRate: 0.49, avgEngagementSeconds: 81, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 17, rankMovement: 0, activeNow: null, visitors: 9_700, growthPct: 17.8, surgeReferrals: 78, sparkline: [35, 37, 36, 38, 40, 39, 41, 42, 41, 43, 44, 45], createdAt: "2026-01-19", breakoutMultiple: 1.4, tags: ["scenarios", "money", "planning"] },
  { siteId: "site-broadcastyard", slug: "broadcastyard", domain: "broadcastyard.com", name: "Broadcast Yard", description: "A small publishing backend for live communities.", categorySlug: "media", categoryName: "Media", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 2_600, typicalActiveNow: 26, engagementRate: 0.57, avgEngagementSeconds: 136, fraudPenalty: 0.02, domainOwnershipVerified: true, previousRank: 20, rankMovement: -1, activeNow: 38, visitors: 7_400, growthPct: 4.9, surgeReferrals: 55, sparkline: [29, 30, 29, 31, 30, 29, 32, 31, 30, 32, 31, 32], createdAt: "2026-02-18", breakoutMultiple: 1.0, tags: ["publishing", "live", "communities"] },
  { siteId: "site-briefbuild", slug: "briefbuild-io", domain: "briefbuild.io", name: "BriefBuild", description: "Turn a rough product idea into a testable brief.", categorySlug: "saas", categoryName: "SaaS", verification: "unverified", ownership: "unclaimed", status: "active", baselineDailyVisitors: null, typicalActiveNow: null, engagementRate: null, avgEngagementSeconds: null, fraudPenalty: 0, domainOwnershipVerified: false, previousRank: 0, rankMovement: 0, activeNow: null, visitors: null, growthPct: null, surgeReferrals: 71, sparkline: [6, 7, 9, 8, 11, 12, 14, 15, 18, 20, 22, 24], createdAt: "2026-08-18", breakoutMultiple: 4.1, tags: ["briefs", "product", "ideas"] },
  { siteId: "site-loomlist", slug: "loomlist-design", domain: "loomlist.design", name: "Loomlist", description: "Save the visual references that teach your team how to see.", categorySlug: "design", categoryName: "Design", verification: "tracker", ownership: "unclaimed", status: "active", baselineDailyVisitors: 1_900, typicalActiveNow: 18, engagementRate: 0.68, avgEngagementSeconds: 162, fraudPenalty: 0, domainOwnershipVerified: false, previousRank: 23, rankMovement: 2, activeNow: 31, visitors: 6_200, growthPct: 226.3, surgeReferrals: 67, sparkline: [8, 9, 11, 12, 14, 14, 17, 19, 21, 25, 28, 30], createdAt: "2026-07-31", breakoutMultiple: 3.7, tags: ["references", "visual", "teams"] },
  { siteId: "site-automata", slug: "automata-ops", domain: "automata.ops", name: "Automata", description: "Small, reliable automations for the parts of work you repeat.", categorySlug: "saas", categoryName: "SaaS", verification: "tracker", ownership: "claimed", status: "active", baselineDailyVisitors: 12_600, typicalActiveNow: 98, engagementRate: 0.6, avgEngagementSeconds: 117, fraudPenalty: 0, domainOwnershipVerified: true, previousRank: 9, rankMovement: -5, activeNow: 112, visitors: 26_400, growthPct: 8.7, surgeReferrals: 52, sparkline: [54, 55, 54, 53, 52, 51, 52, 50, 49, 48, 47, 48], createdAt: "2026-01-09", breakoutMultiple: 1.2, tags: ["automation", "ops", "workflows"] },
];

export const DEMO_SITES: DemoSite[] = siteSeeds.map(seed);

function scoreForWindow(site: DemoSite, window: string): number {
  if (window === "live") return site.heatScore;
  if (window === "7d") return Math.max(0, site.heatScore - (site.growthPct ?? 0) / 40);
  return Math.max(0, site.heatScore + Math.min(5, (site.growthPct ?? 0) / 100));
}

function rankedSites(window = "live", category?: string, query?: string): DemoSite[] {
  const normalizedQuery = query?.trim().toLowerCase();
  return DEMO_SITES
    .filter((site) => !category || category === "all" || site.categorySlug === category)
    .filter((site) => !normalizedQuery || `${site.name} ${site.domain} ${site.categoryName}`.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => scoreForWindow(b, window) - scoreForWindow(a, window) || b.domain.localeCompare(a.domain))
    .map((site, index) => ({ ...site, rank: index + 1 }));
}

export function getLeaderboard(window = "live", category?: string, query?: string): DemoSite[] {
  const sites = rankedSites(window, category, query);
  if (window === "breakout") return sites.sort((a, b) => b.breakoutMultiple - a.breakoutMultiple);
  if (window === "new") return sites.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sites;
}

export function getSite(slug: string): DemoSite | undefined {
  const site = DEMO_SITES.find((candidate) => candidate.slug === slug);
  if (!site) return undefined;
  const rank = rankedSites("live").findIndex((candidate) => candidate.slug === slug) + 1;
  return { ...site, rank: rank > 0 ? rank : 0 };
}

export function getPlatformStats(): PlatformStats {
  const verified = DEMO_SITES.filter((site) => site.verification !== "unverified").length;
  const active = DEMO_SITES.reduce((sum, site) => sum + (site.activeNow ?? 0), 0);
  return { sitesTracked: DEMO_SITES.length, peopleActiveNow: active, breakoutSignalsToday: 18, verifiedSites: verified, isDemo: true };
}

export function getCategories(): CategoryInfo[] {
  return CATEGORIES.map((category) => ({ ...category, id: category.slug, siteCount: DEMO_SITES.filter((site) => site.categorySlug === category.slug).length }));
}

export function getActivity(): ActivityItem[] {
  const rows: Array<[string, ActivityItem["type"], string, string]> = [
    ["2 min ago", "surging", "LaunchPilot", "is surging 5.4× above its usual baseline"],
    ["8 min ago", "rank_up", "QueryNest", "moved into the top 5 in Developer Tools"],
    ["14 min ago", "site_verified", "Flowdesk", "connected GA4 and is now verified"],
    ["21 min ago", "entered_top_10", "OrbitNotes", "entered the global top 10"],
    ["29 min ago", "boost_started", "PixelForge", "started a clearly labeled homepage boost"],
    ["41 min ago", "site_submitted", "Signalroom", "was submitted to the Media category"],
  ];
  return rows.map(([occurredAt, type, siteName, detail], index) => ({ id: `activity-${index}`, type, siteName, siteSlug: DEMO_SITES.find((site) => site.name === siteName)?.slug ?? null, domain: DEMO_SITES.find((site) => site.name === siteName)?.domain ?? null, detail, occurredAt, isDemo: true }));
}

export function getBreakouts(): BreakoutItem[] {
  return getLeaderboard("breakout").slice(0, 8).map((site) => ({ siteId: site.siteId, slug: site.slug, domain: site.domain, name: site.name, categoryName: site.categoryName, categorySlug: site.categorySlug, verification: site.verification, multiple: site.breakoutMultiple, currentVolume: site.visitors ?? 0, baselineVolume: site.baselineDailyVisitors ?? 0, detectedAt: "Today", confidence: site.breakoutMultiple > 5 ? "high" : site.breakoutMultiple > 3 ? "medium" : "low", explanation: site.visitors ? `${formatCount(site.visitors)} visitors in the selected window versus a ${formatCount(site.baselineDailyVisitors)} baseline.` : "Growing fast, but traffic data is not verified yet.", sparkline: site.sparkline, isDemo: true }));
}

export function getTimeseries(slug: string, metric: "visitors" | "active" | "pageviews" | "referrals" = "visitors"): TimeseriesPoint[] {
  const site = getSite(slug);
  if (!site) return [];
  const base = metric === "active" ? site.activeNow ?? 0 : metric === "pageviews" ? site.pageviews24h ?? 0 : metric === "referrals" ? site.surgeReferrals : site.visitors ?? 0;
  return site.sparkline.map((value, index) => ({ t: `${index + 1}:00`, value: Math.max(0, Math.round(base * (value / Math.max(...site.sparkline)) * (metric === "referrals" ? 0.08 : 1))) }));
}

export function getRelatedSites(slug: string): DemoSite[] {
  const site = getSite(slug);
  if (!site) return [];
  return rankedSites("live", site.categorySlug).filter((candidate) => candidate.slug !== slug).slice(0, 3);
}

export function getSponsoredCards(): SponsoredCard[] {
  return [
    { campaignId: "boost-pixelforge", siteSlug: "pixelforge-studio", domain: "pixelforge.studio", name: "PixelForge", description: "Collaborative moodboards and production-ready design systems.", categoryName: "Design", verification: "tracker", organicRank: 2, heatScore: 87, headline: "A sharper way to bring a visual system to life.", placement: "homepage", isDemo: true },
    { campaignId: "boost-shopsignal", siteSlug: "shopsignal-co", domain: "shopsignal.co", name: "ShopSignal", description: "See which products customers are actually searching for next.", categoryName: "Ecommerce", verification: "ga4", organicRank: 5, heatScore: 82, headline: "Know what customers want before the next cart arrives.", placement: "category", isDemo: true },
  ];
}

export function getRankHistory(slug: string): Array<{ period: string; rank: number; heat: number }> {
  const site = getSite(slug);
  if (!site) return [];
  const current = site.rank || rankedSites().findIndex((item) => item.slug === slug) + 1;
  return [
    { period: "May 31", rank: Math.max(current + 8, 12), heat: Math.max(site.heatScore - 18, 31) },
    { period: "Jun 14", rank: Math.max(current + 5, 9), heat: Math.max(site.heatScore - 11, 39) },
    { period: "Jun 28", rank: Math.max(current + 3, 7), heat: Math.max(site.heatScore - 7, 45) },
    { period: "Jul 12", rank: Math.max(current + 2, 5), heat: Math.max(site.heatScore - 4, 52) },
    { period: "Jul 26", rank: Math.max(current + 1, 4), heat: Math.max(site.heatScore - 2, 58) },
    { period: "Now", rank: current, heat: site.heatScore },
  ];
}

export function verificationLabel(site: Pick<DemoSite, "verification">): string {
  return dataSourceLabel(site.verification === "unverified" ? "unverified" : site.verification).label;
}

export function sourceForMetric(site: DemoSite): DataSource {
  return site.verification === "unverified" ? "unverified" : site.verification;
}

export const demoPricing = [
  { name: "Starter", price: "$49", detail: "sample package", impressions: "10,000", popular: false },
  { name: "Growth", price: "$149", detail: "sample package", impressions: "40,000", popular: true },
  { name: "Launch", price: "$299", detail: "sample package", impressions: "100,000", popular: false },
];
