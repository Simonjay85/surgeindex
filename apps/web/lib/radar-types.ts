export const RADAR_WINDOWS = ["7d", "30d", "90d"] as const;

export type RadarWindow = (typeof RADAR_WINDOWS)[number];
export type RadarStatus = "live" | "partial" | "error" | "unconfigured";

export interface RadarMetric {
  label: string;
  value: number;
  normalization: string | null;
  unit: string | null;
}

export interface RadarMetadata {
  confidenceLevel: number | null;
  lastUpdated: string | null;
  startTime: string | null;
  endTime: string | null;
  normalization: string | null;
  unit: string | null;
}

export interface RadarSummary {
  dimensions: RadarMetric[];
  metadata: RadarMetadata;
}

export interface RadarOutage {
  id: string;
  title: string;
  description: string | null;
  scope: string | null;
  locations: string[];
  origin: string | null;
  cause: string | null;
  type: string | null;
  startDate: string | null;
  endDate: string | null;
  linkedUrl: string | null;
}

export interface RadarSnapshot {
  status: RadarStatus;
  configured: boolean;
  source: "cloudflare-radar";
  window: RadarWindow;
  generatedAt: string | null;
  message: string | null;
  errors: string[];
  metadata: RadarMetadata;
  http: {
    deviceMix: RadarSummary;
    botClass: RadarSummary;
  };
  aiBots: {
    crawlPurpose: RadarSummary;
  };
  outages: RadarOutage[];
}
