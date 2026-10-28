import type { DataSource } from "./types";

export interface DataSourceLabel {
  label: string;
  short: string;
  /** Plain-language meaning shown in tooltips. */
  description: string;
  /** Tailwind classes for the badge variant. */
  tone: "green" | "blue" | "coral" | "amber" | "gray";
}

/** Provenance labels — exact wording matters for product integrity. */
export const DATA_SOURCE_LABELS: Record<DataSource, DataSourceLabel> = {
  tracker: {
    label: "Tracker Verified",
    short: "Tracker",
    description:
      "Traffic is measured by the SurgeIndex first-party tracking script.",
    tone: "green",
  },
  ga4: {
    label: "GA4 Verified",
    short: "GA4",
    description:
      "Traffic metrics are imported from a connected Google Analytics 4 property.",
    tone: "blue",
  },
  surgeindex: {
    label: "SurgeIndex Referral",
    short: "Referral",
    description: "Clicks measured from SurgeIndex outbound redirect links.",
    tone: "coral",
  },
  sponsored: {
    label: "Sponsored",
    short: "Sponsored",
    description:
      "This placement was purchased. It does not affect organic rank.",
    tone: "amber",
  },
  demo: {
    label: "Demo Data",
    short: "Demo",
    description: "This number is simulated for product demonstration.",
    tone: "gray",
  },
  unverified: {
    label: "Unverified",
    short: "Unverified",
    description:
      "The site is listed, but traffic data has not been independently connected.",
    tone: "gray",
  },
};

export function dataSourceLabel(source: DataSource): DataSourceLabel {
  return DATA_SOURCE_LABELS[source];
}
