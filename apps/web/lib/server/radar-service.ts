import "server-only";

import { getServerEnv } from "@surge/config";
import type { RadarMetadata, RadarMetric, RadarOutage, RadarSnapshot, RadarSummary, RadarWindow } from "../radar-types";

type JsonRecord = Record<string, unknown>;

const EMPTY_METADATA: RadarMetadata = {
  confidenceLevel: null,
  lastUpdated: null,
  startTime: null,
  endTime: null,
  normalization: null,
  unit: null,
};

const SUMMARY_ENDPOINTS = {
  deviceMix: "http/summary/DEVICE_TYPE",
  botClass: "http/summary/BOT_CLASS",
  crawlPurpose: "ai/bots/summary/CRAWL_PURPOSE",
} as const;

export function normalizeRadarWindow(value: unknown): RadarWindow {
  return value === "30d" || value === "90d" ? value : "7d";
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function safeUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number): string | null {
  const text = asString(value);
  return text ? text.slice(0, maxLength) : null;
}

function firstUnit(meta: JsonRecord): string | null {
  const units = Array.isArray(meta.units) ? meta.units : [];
  const unit = asRecord(units[0]);
  return asString(unit?.value);
}

export function normalizeRadarMetadata(value: unknown): RadarMetadata {
  const meta = asRecord(value) ?? {};
  const confidenceInfo = asRecord(meta.confidenceInfo);
  const ranges = Array.isArray(meta.dateRange) ? meta.dateRange : [];
  const range = ranges.map(asRecord).find((item) => item && (asString(item.startTime) || asString(item.endTime))) ?? null;

  return {
    confidenceLevel: finiteNumber(confidenceInfo?.level),
    lastUpdated: asString(meta.lastUpdated),
    startTime: asString(range?.startTime),
    endTime: asString(range?.endTime),
    normalization: asString(meta.normalization),
    unit: firstUnit(meta),
  };
}

export function normalizeRadarSummary(summary: unknown, metadata?: unknown): RadarSummary {
  const values = asRecord(summary) ?? {};
  const normalizedMetadata = normalizeRadarMetadata(metadata);
  const dimensions: RadarMetric[] = Object.entries(values)
    .map(([label, rawValue]) => {
      const value = finiteNumber(rawValue);
      return value === null ? null : {
        label,
        value,
        normalization: normalizedMetadata.normalization,
        unit: normalizedMetadata.unit,
      } satisfies RadarMetric;
    })
    .filter((item): item is RadarMetric => item !== null)
    .sort((left, right) => right.value - left.value);

  return { dimensions, metadata: normalizedMetadata };
}

function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function normalizeRadarOutages(value: unknown): RadarOutage[] {
  const annotations = Array.isArray(value) ? value : [];
  return annotations.map((raw, index) => {
    const annotation = asRecord(raw) ?? {};
    const outage = asRecord(annotation.outage);
    const locationDetails = Array.isArray(annotation.locationsDetails) ? annotation.locationsDetails.map(asRecord) : [];
    const originDetails = Array.isArray(annotation.originsDetails) ? annotation.originsDetails.map(asRecord) : [];
    const locations = uniqueStrings([
      ...locationDetails.map((item) => asString(item?.name)),
      ...(Array.isArray(annotation.locations) ? annotation.locations.map(asString) : []),
    ]);
    const origin = asString(originDetails[0]?.name) ?? (Array.isArray(annotation.origins) ? asString(annotation.origins[0]) : null);
    const cause = asString(outage?.outageCause);
    const type = asString(outage?.outageType) ?? asString(annotation.eventType);
    const description = boundedText(annotation.description, 320);
    const scope = boundedText(annotation.scope, 180);
    const title = description?.slice(0, 120) ?? ([origin, type, locations[0]].filter(Boolean).join(" · ") || "Internet anomaly");

    return {
      id: asString(annotation.id) ?? `radar-outage-${index}`,
      title,
      description,
      scope,
      locations,
      origin,
      cause,
      type,
      startDate: asString(annotation.startDate),
      endDate: asString(annotation.endDate),
      linkedUrl: safeUrl(annotation.linkedUrl),
    } satisfies RadarOutage;
  });
}

class RadarApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RadarApiError";
  }
}

function buildRadarUrl(baseUrl: string, path: string, window: RadarWindow, extra: Record<string, string> = {}): string {
  const base = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/${path.replace(/^\/+/, "")}`);
  url.searchParams.append("dateRange", window);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

async function fetchRadarResult(path: string, window: RadarWindow, extra: Record<string, string> = {}): Promise<JsonRecord> {
  const env = getServerEnv();
  const url = buildRadarUrl(env.CLOUDFLARE_RADAR_API_BASE_URL, path, window, extra);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.CLOUDFLARE_RADAR_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${env.CLOUDFLARE_RADAR_API_TOKEN}`,
      },
      next: { revalidate: env.CLOUDFLARE_RADAR_CACHE_SECONDS },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const root = asRecord(payload);
    if (!response.ok || root?.success === false) throw new RadarApiError(`http_${response.status}`);
    const result = asRecord(root?.result);
    if (!result) throw new RadarApiError("invalid_response");
    return result;
  } catch (error) {
    if (error instanceof RadarApiError) throw error;
    throw new RadarApiError(error instanceof DOMException && error.name === "AbortError" ? "timeout" : "request_failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function requestSummary(path: string, window: RadarWindow): Promise<RadarSummary> {
  const result = await fetchRadarResult(path, window);
  return normalizeRadarSummary(result.summary_0, result.meta);
}

async function requestOutages(window: RadarWindow): Promise<RadarOutage[]> {
  const result = await fetchRadarResult("annotations/outages", window, { limit: "6" });
  return normalizeRadarOutages(result.annotations);
}

function latestTimestamp(metadatas: RadarMetadata[]): string | null {
  return metadatas
    .map((metadata) => metadata.lastUpdated)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right))
    .at(-1) ?? null;
}

function mergeMetadata(metadatas: RadarMetadata[]): RadarMetadata {
  const usable = metadatas.filter((metadata) => metadata.lastUpdated || metadata.startTime || metadata.endTime || metadata.confidenceLevel !== null);
  const first = usable[0] ?? EMPTY_METADATA;
  const confidenceLevels = usable.map((metadata) => metadata.confidenceLevel).filter((value): value is number => value !== null);
  return {
    confidenceLevel: confidenceLevels.length ? Math.min(...confidenceLevels) : null,
    lastUpdated: latestTimestamp(usable),
    startTime: first.startTime,
    endTime: first.endTime,
    normalization: first.normalization,
    unit: first.unit,
  };
}

function emptySummary(): RadarSummary {
  return { dimensions: [], metadata: { ...EMPTY_METADATA } };
}

function emptySnapshot(window: RadarWindow, status: RadarSnapshot["status"], configured: boolean, message: string | null): RadarSnapshot {
  return {
    status,
    configured,
    source: "cloudflare-radar",
    window,
    generatedAt: configured ? new Date().toISOString() : null,
    message,
    errors: [],
    metadata: { ...EMPTY_METADATA },
    http: { deviceMix: emptySummary(), botClass: emptySummary() },
    aiBots: { crawlPurpose: emptySummary() },
    outages: [],
  };
}

export async function getRadarSnapshot(input: { window?: RadarWindow } = {}): Promise<RadarSnapshot> {
  const window = normalizeRadarWindow(input.window);
  const env = getServerEnv();
  if (!env.CLOUDFLARE_RADAR_API_TOKEN?.trim()) {
    return emptySnapshot(window, "unconfigured", false, "Add CLOUDFLARE_RADAR_API_TOKEN to enable the live Radar layer.");
  }

  const [deviceMix, botClass, crawlPurpose, outages] = await Promise.allSettled([
    requestSummary(SUMMARY_ENDPOINTS.deviceMix, window),
    requestSummary(SUMMARY_ENDPOINTS.botClass, window),
    requestSummary(SUMMARY_ENDPOINTS.crawlPurpose, window),
    requestOutages(window),
  ]);
  const errors: string[] = [];
  const read = <T>(result: PromiseSettledResult<T>, code: string): T | null => {
    if (result.status === "fulfilled") return result.value;
    errors.push(code);
    return null;
  };
  const deviceSummary = read(deviceMix, "http_device_type") ?? emptySummary();
  const botSummary = read(botClass, "http_bot_class") ?? emptySummary();
  const aiSummary = read(crawlPurpose, "ai_bots") ?? emptySummary();
  const outageList = read(outages, "outages") ?? [];
  const summaries = [deviceSummary, botSummary, aiSummary];
  const successfulSurfaces = [deviceMix, botClass, crawlPurpose, outages].filter((result) => result.status === "fulfilled").length;
  const status: RadarSnapshot["status"] = successfulSurfaces === 4 ? "live" : successfulSurfaces > 0 ? "partial" : "error";

  return {
    status,
    configured: true,
    source: "cloudflare-radar",
    window,
    generatedAt: new Date().toISOString(),
    message: status === "live" ? null : status === "partial" ? "Some Radar surfaces are temporarily unavailable." : "Cloudflare Radar is configured but returned no readable data.",
    errors,
    metadata: mergeMetadata(summaries.map((summary) => summary.metadata)),
    http: { deviceMix: deviceSummary, botClass: botSummary },
    aiBots: { crawlPurpose: aiSummary },
    outages: outageList,
  };
}
