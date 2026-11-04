"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    __surgeindexTracker?: { visitorId_?: string; sessionId_?: string; grantConsent?: () => void; optOut?: () => void };
  }
}

export function TrackerFixtureClient({ siteKey, collectorUrl, requireConsent }: { siteKey: string; collectorUrl: string; requireConsent: boolean }) {
  const [path, setPath] = useState(typeof window === "undefined" ? "/" : window.location.pathname);
  const [ids, setIds] = useState({ visitor: "waiting", session: "waiting" });
  useEffect(() => {
    const timer = window.setInterval(() => setIds({ visitor: window.__surgeindexTracker?.visitorId_ ?? "waiting", session: window.__surgeindexTracker?.sessionId_ ?? "waiting" }), 500);
    return () => window.clearInterval(timer);
  }, []);
  function navigate(next: string) {
    window.history.pushState({}, "", next);
    setPath(next);
  }
  return <main style={{ maxWidth: 760, margin: "50px auto", padding: 24, fontFamily: "system-ui" }}><Script src="/tracker.js" strategy="afterInteractive" data-site={siteKey} data-collector={collectorUrl} data-consent-required={requireConsent ? "true" : "false"} /><p style={{ color: "#777", letterSpacing: ".08em", textTransform: "uppercase" }}>Development fixture only</p><h1>SurgeIndex tracker fixture</h1><p>This route loads the built first-party tracker. It exists only for local and staging Playwright/integration checks.</p><div style={{ display: "grid", gap: 8, padding: 16, background: "#f4eee9", borderRadius: 12 }}><strong>Current path: {path}</strong><span>Visitor ID: {ids.visitor}</span><span>Session ID: {ids.session}</span><span>Collector: {collectorUrl}</span></div><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}><button onClick={() => navigate("/dev/tracker-fixture/one")}>SPA route one</button><button onClick={() => navigate("/dev/tracker-fixture/two?private=strip-me")}>SPA route two</button><button onClick={() => window.__surgeindexTracker?.grantConsent?.()}>Grant consent</button><button onClick={() => window.__surgeindexTracker?.optOut?.()}>Opt out</button></div><p style={{ color: "#777" }}>Use the browser devtools/network panel to inspect accepted collector responses. IDs are shown here only because this is a development route.</p></main>;
}

