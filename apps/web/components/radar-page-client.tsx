"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Clock3, ExternalLink, Info, LoaderCircle, RefreshCw, Smartphone, WifiOff } from "lucide-react";
import { SourceBadge, StatBlock } from "./app-shell";
import type { RadarMetric, RadarOutage, RadarSnapshot, RadarSummary, RadarWindow } from "../lib/radar-types";
import { RADAR_WINDOWS } from "../lib/radar-types";

const WINDOW_LABELS: Record<RadarWindow, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days" };

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function metricValue(metric: RadarMetric | undefined): string {
  if (!metric) return "—";
  if (metric.normalization === "PERCENTAGE") return `${metric.value.toFixed(1)}%`;
  const number = metric.value.toLocaleString("en-US", { maximumFractionDigits: metric.value >= 100 ? 0 : 2 });
  return metric.unit ? `${number} ${metric.unit}` : number;
}

function metricFor(summary: RadarSummary, label: string): RadarMetric | undefined {
  const target = label.toUpperCase();
  return summary.dimensions.find((metric) => metric.label.toUpperCase() === target);
}

function formatDate(value: string | null): string {
  if (!value) return "No timestamp";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Timestamp unavailable" : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatRange(snapshot: RadarSnapshot): string {
  if (!snapshot.metadata.startTime || !snapshot.metadata.endTime) return WINDOW_LABELS[snapshot.window];
  return `${formatDate(snapshot.metadata.startTime)} → ${formatDate(snapshot.metadata.endTime)}`;
}

function statusLabel(snapshot: RadarSnapshot): string {
  if (snapshot.status === "unconfigured") return "Setup required";
  if (snapshot.status === "partial") return "Partial read";
  if (snapshot.status === "error") return "Unavailable";
  return "Live read";
}

function statusClass(snapshot: RadarSnapshot): string {
  if (snapshot.status === "live") return "status-active";
  if (snapshot.status === "partial") return "status-scheduled";
  return "status-completed";
}

function SummaryList({ title, description, icon, summary }: { title: string; description: string; icon: React.ReactNode; summary: RadarSummary }) {
  const max = summary.dimensions[0]?.value || 1;
  return <section className="radar-summary-block"><div className="radar-summary-title"><span className="radar-summary-icon">{icon}</span><div><h3>{title}</h3><p>{description}</p></div></div>{summary.dimensions.length ? <div className="radar-dimension-list">{summary.dimensions.slice(0, 6).map((metric) => <div className="radar-dimension-row" key={metric.label}><div className="radar-dimension-label"><span>{humanize(metric.label)}</span><strong>{metricValue(metric)}</strong></div><div className="radar-meter"><span style={{ width: `${Math.max(3, Math.min(100, (metric.value / max) * 100))}%` }} /></div></div>)}</div> : <div className="radar-inline-empty"><WifiOff size={15} /> No readable values in this window.</div>}</section>;
}

function OutageCard({ outage }: { outage: RadarOutage }) {
  return <article className="radar-outage"><div className="radar-outage-topline"><span className="status-chip status-scheduled">{humanize(outage.type ?? "anomaly")}</span><time><Clock3 size={12} /> {formatDate(outage.startDate)}</time></div><h3>{outage.title}</h3>{outage.description && outage.description !== outage.title ? <p>{outage.description}</p> : null}<div className="radar-outage-meta">{outage.scope || outage.locations.length ? <span>{outage.scope ?? outage.locations.join(", ")}</span> : null}{outage.origin ? <span>{outage.origin}</span> : null}{outage.cause ? <span>{humanize(outage.cause)}</span> : null}{outage.linkedUrl ? <a href={outage.linkedUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={12} /></a> : null}</div></article>;
}

export function RadarPageClient({ initialSnapshot, initialWindow }: { initialSnapshot: RadarSnapshot; initialWindow: RadarWindow }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [window, setWindow] = useState(initialWindow);
  const [loading, setLoading] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const humanTraffic = metricFor(snapshot.http.botClass, "LIKELY_HUMAN");
  const mobileTraffic = metricFor(snapshot.http.deviceMix, "MOBILE");
  const topAiPurpose = snapshot.aiBots.crawlPurpose.dimensions[0];
  const rangeLabel = useMemo(() => formatRange(snapshot), [snapshot]);

  async function loadWindow(nextWindow: RadarWindow) {
    setWindow(nextWindow);
    setLoading(true);
    setRefreshError(null);
    try {
      const response = await fetch(`/api/radar?window=${nextWindow}`, { cache: "no-store" });
      if (!response.ok) throw new Error("radar_request_failed");
      const payload = await response.json() as { data?: RadarSnapshot };
      if (!payload.data) throw new Error("radar_payload_missing");
      setSnapshot(payload.data);
    } catch {
      setRefreshError("Radar could not refresh right now. The last readable state remains on screen.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="container page-hero radar-page"><div className="page-hero-grid"><div><div className="eyebrow">GLOBAL SIGNAL LAYER</div><h1>Radar for the living web.</h1><p>Cloudflare Radar adds internet-wide context to the attention board: how requests are moving, how devices and bots split the web, and where verified anomalies are showing up.</p></div><div className="page-hero-aside"><span>data source</span><strong>Cloudflare Radar</strong><span>{rangeLabel}</span><div className="radar-aside-status"><span className={`status-chip ${statusClass(snapshot)}`}>{statusLabel(snapshot)}</span><SourceBadge source="radar" compact /></div></div></div><div className="section-tight"><div className="radar-toolbar"><div><div className="eyebrow">READ WINDOW</div><div className="window-tabs" role="tablist" aria-label="Radar date range">{RADAR_WINDOWS.map((item) => <button className={`window-tab ${window === item ? "window-tab-active" : ""}`} key={item} type="button" role="tab" aria-selected={window === item} disabled={loading} onClick={() => void loadWindow(item)}>{WINDOW_LABELS[item]}</button>)}</div></div><button className="button button-quiet button-small" type="button" disabled={loading} onClick={() => void loadWindow(window)}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} {loading ? "Refreshing" : "Refresh"}</button></div>{snapshot.message ? <div className={`radar-notice ${snapshot.status === "error" ? "radar-notice-error" : snapshot.status === "unconfigured" ? "radar-notice-setup" : ""}`}><span className="radar-notice-icon">{snapshot.status === "error" ? <WifiOff size={17} /> : snapshot.status === "unconfigured" ? <Info size={17} /> : <AlertTriangle size={17} />}</span><div><strong>{snapshot.status === "unconfigured" ? "Radar is wired, awaiting a read-only token." : snapshot.message}</strong><p>{snapshot.status === "unconfigured" ? "Add CLOUDFLARE_RADAR_API_TOKEN on the server. The page will stay explicit and will not substitute demo numbers." : snapshot.errors.length ? `Unavailable surfaces: ${snapshot.errors.map(humanize).join(", ")}.` : "The read remains separate from SurgeIndex rankings and Heat Score."}</p></div>{snapshot.status === "unconfigured" ? <a className="text-link" href="https://developers.cloudflare.com/radar/get-started/first-request/" target="_blank" rel="noreferrer">Cloudflare setup <ExternalLink size={13} /></a> : null}</div> : null}{refreshError ? <div className="radar-refresh-error" role="status"><AlertTriangle size={14} /> {refreshError}</div> : null}<div className="radar-metric-grid"><StatBlock label="Likely human HTTP" value={metricValue(humanTraffic)} detail={humanTraffic ? `BOT_CLASS · ${WINDOW_LABELS[snapshot.window]}` : "Awaiting Radar data"} tone="green" source="radar" /><StatBlock label="Mobile share" value={metricValue(mobileTraffic)} detail={mobileTraffic ? `DEVICE_TYPE · ${WINDOW_LABELS[snapshot.window]}` : "Awaiting Radar data"} tone="coral" source="radar" /><StatBlock label="Top AI bot purpose" value={topAiPurpose ? metricValue(topAiPurpose) : "—"} detail={topAiPurpose ? `${humanize(topAiPurpose.label)} of AI bot requests` : "Awaiting Radar data"} source="radar" /><StatBlock label="Internet alerts" value={snapshot.outages.length.toLocaleString("en-US")} detail={snapshot.status === "unconfigured" ? "No external read configured" : "Cloudflare outage/anomaly records"} tone={snapshot.outages.length ? "coral" : "default"} source="radar" /></div></div><div className="section-tight"><div className="radar-grid"><div className="panel"><div className="panel-heading"><div><h2>Internet composition</h2><p>Distribution values are returned by Radar for the selected window; they are not SurgeIndex site traffic.</p></div><Bot size={18} color="#5f5c98" /></div><div className="radar-summary-grid"><SummaryList title="Device mix" description="HTTP requests grouped by device type." icon={<Smartphone size={16} />} summary={snapshot.http.deviceMix} /><SummaryList title="Bot class" description="Likely human versus automated requests." icon={<Bot size={16} />} summary={snapshot.http.botClass} /><SummaryList title="AI bot purpose" description="AI bot requests grouped by crawl purpose." icon={<CheckCircle2 size={16} />} summary={snapshot.aiBots.crawlPurpose} /></div></div><div className="panel"><div className="panel-heading"><div><h2>Outages & anomalies</h2><p>Latest Internet-level records returned by Cloudflare Radar.</p></div><AlertTriangle size={18} color="#bc7628" /></div>{snapshot.outages.length ? <div className="radar-outage-list">{snapshot.outages.map((outage) => <OutageCard key={outage.id} outage={outage} />)}</div> : <div className="radar-empty"><AlertTriangle size={18} /><h3>{snapshot.status === "unconfigured" ? "No outage feed connected" : snapshot.status === "error" ? "Outage feed unavailable" : "No outage records in this read"}</h3><p>{snapshot.status === "unconfigured" ? "Configure the Radar token to read current Internet-level anomalies." : "Cloudflare returned no outage or anomaly records for the selected window."}</p></div>}</div></div></div><div className="section-tight"><div className="method-note radar-method-note"><Info size={14} /><span><strong>Boundary:</strong> Radar is an external context layer. It does not enter Heat Score, organic rank, breakout eligibility, paid delivery, or per-site traffic attribution. Last Radar dataset update: {formatDate(snapshot.metadata.lastUpdated)}.</span></div></div></div>;
}
