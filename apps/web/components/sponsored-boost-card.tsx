"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BoostPlacementKey } from "@surge/boost";
import { commercialUiEnabled } from "./app-shell";

type ServedBoost = {
  isDemo: boolean;
  campaignId: string;
  siteSlug: string;
  placementKey: BoostPlacementKey;
  headline: string;
  description?: string;
  descriptionText?: string;
  ctaLabel: string;
  clickToken: string;
  impressionToken: string;
  minimumVisiblePercent: number;
  minimumVisibleMilliseconds: number;
};

export function SponsoredBoostCard({ placement = "homepage_boosted", categoryId, siteId, routeContext }: { placement?: BoostPlacementKey; categoryId?: string; siteId?: string; routeContext?: string }) {
  const [served, setServed] = useState<ServedBoost | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const startedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorded = useRef(false);

  useEffect(() => {
    if (!commercialUiEnabled) return;
    let cancelled = false;
    const route = routeContext ?? (typeof window === "undefined" ? "/" : window.location.pathname);
    const params = new URLSearchParams({ placement, route });
    if (categoryId) params.set("categoryId", categoryId);
    if (siteId) params.set("siteId", siteId);
    fetch(`/api/boost/serve?${params.toString()}`, { headers: { accept: "application/json" }, cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ data: ServedBoost | null }> : Promise.reject(new Error("boost_serve_failed")))
      .then((payload) => { if (!cancelled) setServed(payload.data); })
      .catch(() => { if (!cancelled) setServed(null); });
    return () => { cancelled = true; };
  }, [categoryId, placement, routeContext, siteId]);

  useEffect(() => {
    if (!served || !cardRef.current) return;
    const node = cardRef.current;
    recorded.current = false;
    const minimumPercent = served.minimumVisiblePercent;
    const minimumMilliseconds = served.minimumVisibleMilliseconds;
    const qualify = () => {
      if (recorded.current) return;
      recorded.current = true;
      void fetch("/api/boost/impressions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: served.impressionToken, eventId: crypto.randomUUID(), visiblePercent: minimumPercent, visibleMilliseconds: minimumMilliseconds }) });
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= minimumPercent / 100) {
        startedAt.current = Date.now();
        timer.current = setTimeout(() => { if ((startedAt.current ?? 0) > 0) qualify(); }, minimumMilliseconds);
      } else if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        startedAt.current = null;
      }
    }, { threshold: [0, minimumPercent / 100, 1] });
    observer.observe(node);
    return () => { observer.disconnect(); if (timer.current) clearTimeout(timer.current); };
  }, [served]);

  if (!commercialUiEnabled || !served) return null;
  const description = served.descriptionText ?? served.description ?? "";
  return <article ref={cardRef} className="sponsored-card" aria-label="Sponsored placement"><div className="sponsored-card-label"><span>Sponsored</span>{served.isDemo ? <em>Demo delivery · not billable</em> : <em>Paid placement</em>}</div><div className="sponsored-card-body"><div><h3>{served.headline}</h3><p>{description}</p></div><Link className="button button-coral button-small" href={`/go/${served.siteSlug}?campaign=${encodeURIComponent(served.clickToken)}`} prefetch={false}>{served.ctaLabel}</Link></div><p className="sponsored-card-note">This website paid for placement. Payment does not affect organic rank or Heat Score.</p></article>;
}
