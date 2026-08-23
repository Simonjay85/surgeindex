import "server-only";

import { domainToUrl, normalizeDomain } from "@surge/shared";
import { BOOST_PLACEMENTS, type BoostPackageDefinition, type BoostPlacementKey } from "@surge/boost";
import { getServerEnv } from "@surge/config";

export interface BoostPlacementDefinition {
  key: BoostPlacementKey;
  name: string;
  description: string;
  routePattern: string;
  eligibleCategories: string[];
  deviceSupport: string[];
  creativeSpec: { headlineMax: number; descriptionMax: number; ctaMax: number };
  frequencyCapPerVisitorPerDay: number;
  viewability: { minimumPercent: number; minimumMilliseconds: number };
  active: boolean;
}

const placementDefinitions: Record<BoostPlacementKey, BoostPlacementDefinition> = {
  homepage_boosted: {
    key: "homepage_boosted",
    name: "Homepage boosted",
    description: "A clearly separated sponsored card on the public homepage.",
    routePattern: "/",
    eligibleCategories: [],
    deviceSupport: ["desktop", "mobile", "tablet"],
    creativeSpec: { headlineMax: 80, descriptionMax: 180, ctaMax: 24 },
    frequencyCapPerVisitorPerDay: 3,
    viewability: { minimumPercent: 50, minimumMilliseconds: 1_000 },
    active: true,
  },
  category_boosted: {
    key: "category_boosted",
    name: "Category boosted",
    description: "A sponsored recommendation within a matching category surface.",
    routePattern: "/categories/:slug",
    eligibleCategories: [],
    deviceSupport: ["desktop", "mobile", "tablet"],
    creativeSpec: { headlineMax: 80, descriptionMax: 180, ctaMax: 24 },
    frequencyCapPerVisitorPerDay: 3,
    viewability: { minimumPercent: 50, minimumMilliseconds: 1_000 },
    active: true,
  },
  ranking_feed_insert: {
    key: "ranking_feed_insert",
    name: "Ranking feed insert",
    description: "A separated sponsored insertion adjacent to, never inside, the organic board.",
    routePattern: "/rankings",
    eligibleCategories: [],
    deviceSupport: ["desktop", "mobile", "tablet"],
    creativeSpec: { headlineMax: 80, descriptionMax: 180, ctaMax: 24 },
    frequencyCapPerVisitorPerDay: 3,
    viewability: { minimumPercent: 50, minimumMilliseconds: 1_000 },
    active: true,
  },
  site_profile_recommendation: {
    key: "site_profile_recommendation",
    name: "Site profile recommendation",
    description: "A labeled sponsored recommendation on a site profile.",
    routePattern: "/site/:slug",
    eligibleCategories: [],
    deviceSupport: ["desktop", "mobile", "tablet"],
    creativeSpec: { headlineMax: 80, descriptionMax: 180, ctaMax: 24 },
    frequencyCapPerVisitorPerDay: 3,
    viewability: { minimumPercent: 50, minimumMilliseconds: 1_000 },
    active: true,
  },
  breakout_sponsor: {
    key: "breakout_sponsor",
    name: "Breakout sponsor",
    description: "A labeled sponsor adjacent to breakout signals without changing breakout eligibility.",
    routePattern: "/breakouts",
    eligibleCategories: [],
    deviceSupport: ["desktop", "mobile", "tablet"],
    creativeSpec: { headlineMax: 80, descriptionMax: 180, ctaMax: 24 },
    frequencyCapPerVisitorPerDay: 3,
    viewability: { minimumPercent: 50, minimumMilliseconds: 1_000 },
    active: true,
  },
};

export function listBoostPlacements(): BoostPlacementDefinition[] {
  const env = getServerEnv();
  return BOOST_PLACEMENTS.map((key) => ({
    ...placementDefinitions[key],
    frequencyCapPerVisitorPerDay: env.BOOST_MAX_FREQUENCY_PER_VISITOR_PER_DAY,
    viewability: {
      minimumPercent: env.BOOST_IMPRESSION_VISIBILITY_PERCENT,
      minimumMilliseconds: env.BOOST_IMPRESSION_VISIBILITY_MS,
    },
  }));
}

export function getBoostPlacement(key: string): BoostPlacementDefinition | null {
  if (!BOOST_PLACEMENTS.includes(key as BoostPlacementKey)) return null;
  const env = getServerEnv();
  const definition = placementDefinitions[key as BoostPlacementKey];
  return {
    ...definition,
    frequencyCapPerVisitorPerDay: env.BOOST_MAX_FREQUENCY_PER_VISITOR_PER_DAY,
    viewability: { minimumPercent: env.BOOST_IMPRESSION_VISIBILITY_PERCENT, minimumMilliseconds: env.BOOST_IMPRESSION_VISIBILITY_MS },
  };
}

export function listBoostPackages(): BoostPackageDefinition[] {
  const env = getServerEnv();
  return [
    {
      id: "starter",
      name: "Starter",
      description: "A bounded first test of qualified sponsored distribution.",
      currency: env.BOOST_DEFAULT_CURRENCY,
      amountCents: 14_900,
      stripePriceId: env.BOOST_STARTER_PRICE_ID ?? null,
      targetQualifiedImpressions: 10_000,
      eligiblePlacements: ["homepage_boosted", "category_boosted", "site_profile_recommendation"],
      eligibleCategories: [],
      defaultDurationDays: env.BOOST_DEFAULT_CAMPAIGN_DAYS,
      maximumDurationDays: env.BOOST_MAX_CAMPAIGN_DAYS,
      active: true,
      displayOrder: 1,
    },
    {
      id: "growth",
      name: "Growth",
      description: "More qualified impressions with the same transparent reporting rules.",
      currency: env.BOOST_DEFAULT_CURRENCY,
      amountCents: 39_900,
      stripePriceId: env.BOOST_GROWTH_PRICE_ID ?? null,
      targetQualifiedImpressions: 35_000,
      eligiblePlacements: ["homepage_boosted", "category_boosted", "ranking_feed_insert", "site_profile_recommendation", "breakout_sponsor"],
      eligibleCategories: [],
      defaultDurationDays: env.BOOST_DEFAULT_CAMPAIGN_DAYS,
      maximumDurationDays: env.BOOST_MAX_CAMPAIGN_DAYS,
      active: true,
      displayOrder: 2,
    },
    {
      id: "launch",
      name: "Launch",
      description: "A larger, paced package for a reviewed launch window.",
      currency: env.BOOST_DEFAULT_CURRENCY,
      amountCents: 89_900,
      stripePriceId: env.BOOST_LAUNCH_PRICE_ID ?? null,
      targetQualifiedImpressions: 100_000,
      eligiblePlacements: ["homepage_boosted", "category_boosted", "ranking_feed_insert", "site_profile_recommendation", "breakout_sponsor"],
      eligibleCategories: [],
      defaultDurationDays: env.BOOST_DEFAULT_CAMPAIGN_DAYS,
      maximumDurationDays: env.BOOST_MAX_CAMPAIGN_DAYS,
      active: true,
      displayOrder: 3,
    },
    {
      id: "custom",
      name: "Custom",
      description: "Requires an approved server-side quote before checkout.",
      currency: env.BOOST_DEFAULT_CURRENCY,
      amountCents: null,
      stripePriceId: null,
      targetQualifiedImpressions: null,
      eligiblePlacements: [...BOOST_PLACEMENTS],
      eligibleCategories: [],
      defaultDurationDays: env.BOOST_DEFAULT_CAMPAIGN_DAYS,
      maximumDurationDays: env.BOOST_MAX_CAMPAIGN_DAYS,
      active: false,
      displayOrder: 4,
    },
  ];
}

export function getBoostPackage(packageKey: string): BoostPackageDefinition | null {
  return listBoostPackages().find((item) => item.id === packageKey) ?? null;
}

export function legacyPlacementFor(key: BoostPlacementKey): "homepage" | "category" | "ranking_feed" | "profile_recommendation" | "breakout_feed" {
  const legacyPlacements: Record<BoostPlacementKey, "homepage" | "category" | "ranking_feed" | "profile_recommendation" | "breakout_feed"> = {
    homepage_boosted: "homepage",
    category_boosted: "category",
    ranking_feed_insert: "ranking_feed",
    site_profile_recommendation: "profile_recommendation",
    breakout_sponsor: "breakout_feed",
  };
  return legacyPlacements[key];
}

export function sanitizeCreative(input: { headline?: string; description?: string; ctaLabel?: string; destinationUrl?: string; siteDomain: string; logoUrl?: string | null }, placement: BoostPlacementDefinition) {
  const clean = (value: string | undefined, max: number, fallback: string) => (value ?? fallback).replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const canonicalDomain = normalizeDomain(input.siteDomain);
  if (!canonicalDomain) throw new Error("invalid_site_domain");
  const fallbackDestination = domainToUrl(canonicalDomain);
  let destination = fallbackDestination;
  if (input.destinationUrl) {
    try {
      const candidate = new URL(input.destinationUrl);
      const candidateDomain = normalizeDomain(candidate.toString());
      if (candidate.protocol !== "http:" && candidate.protocol !== "https:") throw new Error("invalid_destination");
      if (!candidateDomain || candidateDomain !== canonicalDomain) throw new Error("destination_mismatch");
      destination = candidate.toString().slice(0, 2_048);
    } catch {
      throw new Error("invalid_destination");
    }
  }
  return {
    headline: clean(input.headline, placement.creativeSpec.headlineMax, "Discover this site"),
    description: clean(input.description, placement.creativeSpec.descriptionMax, "Explore a verified site in the SurgeIndex directory."),
    ctaLabel: clean(input.ctaLabel, placement.creativeSpec.ctaMax, "Visit site"),
    destinationUrl: destination,
    logoUrl: input.logoUrl?.startsWith("https://") ? input.logoUrl.slice(0, 2_048) : null,
  };
}

export function packageSnapshot(pkg: BoostPackageDefinition): Record<string, unknown> {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    currency: pkg.currency,
    amountCents: pkg.amountCents,
    stripePriceId: pkg.stripePriceId,
    targetQualifiedImpressions: pkg.targetQualifiedImpressions,
    eligiblePlacements: pkg.eligiblePlacements,
    eligibleCategories: pkg.eligibleCategories,
    defaultDurationDays: pkg.defaultDurationDays,
    maximumDurationDays: pkg.maximumDurationDays,
  };
}
