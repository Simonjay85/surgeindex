"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Unplug } from "lucide-react";

type Property = { propertyId: string; displayName: string; accountDisplayName: string; propertyType: string | null; timeZone: string | null; currencyCode: string | null };
type Stream = { streamId: string; displayName: string; defaultUri: string | null; measurementId: string | null; streamType: string; propertyId: string };
type Status = { connection: { propertyId: string; propertyName: string | null; streamId: string | null; streamName: string | null; streamDefaultUri: string | null; measurementId: string | null; domainMatchState: string | null; connectionState: string; lastSuccessfulReportAt: string | null; lastSyncAt: string | null; rankingEligible: boolean; lastError: string | null } | null; backfill: { totalDays: number; processedDays: number; status: string } | null; rankingSource: string; rankingSourceVersion: string; disabled?: boolean };

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? "The request could not be completed.");
  return payload.data as T;
}

export function Ga4ConnectionClient({ siteId, domain, isDemo }: { siteId: string; domain: string; isDemo: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [query, setQuery] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try { setStatus(await readJson<Status>(`/api/sites/${siteId}/ga4/status`)); } catch (error) { setMessage(error instanceof Error ? error.message : "GA4 status is unavailable."); }
  }, [siteId]);

  // The request is the external synchronization; the callback updates state
  // only after the status response resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const connected = status?.connection?.connectionState === "connected";
  const selecting = status?.connection?.connectionState === "selecting_property" || status?.connection?.connectionState === "authorizing";
  const selectedStream = useMemo(() => streams.find((stream) => stream.streamId === streamId), [streams, streamId]);

  async function connect() {
    setBusy("connect"); setMessage(null);
    try { const result = await readJson<{ authorizationUrl: string }>(`/api/sites/${siteId}/ga4/connect`, { method: "POST", body: JSON.stringify({ returnPath: `/dashboard/sites/${siteId}/ga4` }) }); window.location.assign(result.authorizationUrl); }
    catch (error) { setMessage(error instanceof Error ? error.message : "GA4 authorization could not be started."); setBusy(null); }
  }

  async function loadProperties() {
    setBusy("properties"); setMessage(null);
    try { const result = await readJson<{ properties: Property[] }>(`/api/sites/${siteId}/ga4/properties${query ? `?q=${encodeURIComponent(query)}` : ""}`); setProperties(result.properties); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Properties could not be loaded."); }
    finally { setBusy(null); }
  }

  async function loadStreams(nextPropertyId = propertyId) {
    setBusy("streams"); setMessage(null);
    try { const result = await readJson<{ streams: Stream[] }>(`/api/sites/${siteId}/ga4/properties/${encodeURIComponent(nextPropertyId)}/streams`); setStreams(result.streams); setStreamId(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Web streams could not be loaded."); }
    finally { setBusy(null); }
  }

  async function validateAndSelect() {
    setBusy("select"); setMessage(null);
    try {
      await readJson(`/api/sites/${siteId}/ga4/test`, { method: "POST", body: JSON.stringify({ propertyId, streamId }) });
      await readJson(`/api/sites/${siteId}/ga4/select`, { method: "POST", body: JSON.stringify({ propertyId, streamId }) });
      setMessage("GA4 web stream validated. Initial history import is queued.");
      await loadStatus();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The selected stream could not be validated."); }
    finally { setBusy(null); }
  }

  async function mutate(path: string, body: Record<string, unknown> = {}, success: string) {
    setBusy(path); setMessage(null);
    try { await readJson(`/api/sites/${siteId}/ga4/${path}`, { method: "POST", body: JSON.stringify(body) }); setMessage(success); await loadStatus(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The GA4 operation failed."); }
    finally { setBusy(null); }
  }

  if (isDemo || status?.disabled) return <div className="panel"><div className="panel-heading"><div><h2>Connect Google Analytics</h2><p>Read-only GA4 is implemented server-side; this demo workspace does not access Google credentials.</p></div><ShieldCheck size={18} color="#3977bd" /></div><div className="dashboard-alert"><ShieldCheck size={15} /><span>Fixture provider tests cover OAuth state, property selection, reports, refresh failures, and source isolation. No Google API is called from this public demo.</span></div></div>;

  return <div className="section-tight">
    <div className="panel"><div className="panel-heading"><div><h2>Connect Google Analytics</h2><p>Read-only access for <strong>{domain}</strong>. SurgeIndex cannot modify properties, streams, events, audiences, or access bindings.</p></div><ShieldCheck size={18} color="#3977bd" /></div><div className="dashboard-list"><div className="dashboard-list-row"><div><strong>Ownership is separate</strong><span>You must already manage this SurgeIndex site. Google property access does not prove domain ownership.</span></div><Check size={16} /></div><div className="dashboard-list-row"><div><strong>Metric definitions stay visible</strong><span>GA4 active users and tracker active visitors are different measures and are never added together.</span></div><Check size={16} /></div></div>{status?.connection?.lastError ? <div className="dashboard-alert" style={{ marginTop: 12 }}><Unplug size={15} /><span>{status.connection.lastError}</span></div> : null}<button className="button button-coral" onClick={() => void connect()} disabled={busy !== null}>{busy === "connect" ? <LoaderCircle className="spin" size={15} /> : <ExternalLink size={15} />} {status?.connection?.connectionState === "reauthorization_required" ? "Reauthorize Google" : "Connect Google Analytics"}</button></div>

    {selecting ? <div className="panel"><div className="panel-heading"><div><h2>Select a GA4 property</h2><p>Only properties returned by the granted read-only token are shown.</p></div><RefreshCw size={17} /></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input aria-label="Search GA4 properties" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search account or property" /><button className="button button-quiet" onClick={() => void loadProperties()} disabled={busy !== null}>{busy === "properties" ? "Loading…" : "Load properties"}</button></div>{properties.length ? <div className="dashboard-list" style={{ marginTop: 12 }}>{properties.map((property) => <button key={property.propertyId} className={`dashboard-list-row ${propertyId === property.propertyId ? "is-selected" : ""}`} onClick={() => { setPropertyId(property.propertyId); void loadStreams(property.propertyId); }}><span><strong>{property.displayName}</strong><span>{property.accountDisplayName} · {property.propertyId} · {property.timeZone ?? "Time zone unavailable"}</span></span><span>{property.currencyCode ?? "—"}</span></button>)}</div> : <p className="muted">Load accessible properties to continue.</p>}</div> : null}

    {selecting && propertyId ? <div className="panel"><div className="panel-heading"><div><h2>Select a web data stream</h2><p>Android and iOS streams are ignored for website traffic.</p></div><RefreshCw size={17} /></div>{streams.length ? <div className="dashboard-list">{streams.map((stream) => <button key={stream.streamId} className="dashboard-list-row" onClick={() => setStreamId(stream.streamId)}><span><strong>{stream.displayName}</strong><span>{stream.defaultUri ?? "No default URI"} · {stream.measurementId ?? "No measurement ID"}</span></span><span>{streamId === stream.streamId ? <Check size={16} /> : "web"}</span></button>)}</div> : <p className="muted">{busy === "streams" ? "Loading streams…" : "Choose a property to load streams."}</p>}{selectedStream ? <div className="dashboard-alert" style={{ marginTop: 12 }}><ShieldCheck size={15} /><span>Domain match is checked against <strong>{domain}</strong> using the stream default URI, not its display name or Measurement ID.</span></div> : null}<button className="button button-coral" onClick={() => void validateAndSelect()} disabled={!streamId || busy !== null}>{busy === "select" ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Test and connect stream</button></div> : null}

    {connected && status?.connection ? <div className="panel"><div className="panel-heading"><div><h2>GA4 Connected</h2><p>{status.connection.propertyName} · {status.connection.propertyId}</p></div><span className="status-chip status-active"><Check size={13} /> connected</span></div><div className="dashboard-grid"><div className="dashboard-card"><small>Web stream</small><strong>{status.connection.streamName ?? "—"}</strong><p>{status.connection.streamDefaultUri ?? "—"} · {status.connection.measurementId ?? "No measurement ID"}</p></div><div className="dashboard-card"><small>Data freshness</small><strong>{status.connection.lastSuccessfulReportAt ? new Date(status.connection.lastSuccessfulReportAt).toLocaleString() : "—"}</strong><p>{status.connection.connectionState}</p></div><div className="dashboard-card"><small>Backfill</small><strong>{status.backfill ? `${status.backfill.processedDays} of ${status.backfill.totalDays} days` : "Queued"}</strong><p>{status.backfill?.status ?? "Initial import"}</p></div><div className="dashboard-card"><small>Ranking source</small><strong>{status.rankingSource === "ga4" ? "GA4" : "Tracker"}</strong><p>{status.rankingSourceVersion} · connecting GA4 did not switch it</p></div></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button button-quiet" onClick={() => void mutate("sync", { type: "all" }, "GA4 sync finished; persisted aggregates remain available if a provider call was delayed.")} disabled={busy !== null}>{busy === "sync" ? "Syncing…" : "Sync now"}</button><button className="button button-quiet" onClick={() => void mutate("backfill", {}, "Historical backfill queued.")} disabled={busy !== null}>{busy === "backfill" ? "Queueing…" : "Queue history"}</button><button className="button button-quiet" onClick={() => void mutate("reauthorize", {}, "Reauthorization started.")} disabled={busy !== null}>Reauthorize</button><button className="button button-quiet" onClick={() => void mutate("disconnect", { revoke: false }, "Disconnected from SurgeIndex. Imported history is retained.")} disabled={busy !== null}>Disconnect locally</button></div><p className="muted" style={{ marginTop: 12 }}>GA4 realtime is labeled “active users — last 5/30 minutes.” It is not tracker “Online Now.”</p></div> : null}
    {message ? <div className="method-note" role="status">{message}</div> : null}
  </div>;
}
