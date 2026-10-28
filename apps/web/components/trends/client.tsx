"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Globe2 } from "lucide-react";
import type { TrendRegion } from "../../lib/trends/types";

/* ───────────── Live clock (no hydration mismatch, no setState-in-effect) ───────────── */

function subscribeClock(onChange: () => void) {
  const id = window.setInterval(onChange, 20_000);
  return () => window.clearInterval(id);
}
const clockSnapshot = () => Math.floor(Date.now() / 20_000) * 20_000;
const serverClock = () => null;

function useNow(): number | null {
  return useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
}

function relative(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${min % 60 ? `${min % 60}m ` : ""}ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function UpdatedPulse({ at, label = "Updated", fallback }: { at: string | null; label?: string; fallback: string }) {
  const now = useNow();
  const stale = at && now ? now - Date.parse(at) > 3 * 3_600_000 : false;
  return (
    <span className={`t-pulse ${stale ? "is-stale" : ""}`}>
      <span className="t-pulse-dot" aria-hidden="true" />
      <span>
        {label} <time dateTime={at ?? undefined}>{at && now ? relative(at, now) : fallback}</time>
      </span>
    </span>
  );
}

/* ───────────────────────────── Region scope ───────────────────────────── */

const RegionContext = createContext<{ region: TrendRegion; setRegion: (r: TrendRegion) => void }>({ region: "global", setRegion: () => {} });

export function RegionScope({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [region, setRegionState] = useState<TrendRegion>("global");
  const setRegion = useCallback((r: TrendRegion) => {
    setRegionState(r);
    try {
      window.localStorage.setItem("si-region", r);
    } catch {
      // storage unavailable: preference is per-visit only
    }
  }, []);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("si-region");
    } catch {
      saved = null;
    }
    if (saved === "vn") {
      const id = window.requestAnimationFrame(() => setRegionState("vn"));
      return () => window.cancelAnimationFrame(id);
    }
  }, []);
  return (
    <RegionContext.Provider value={{ region, setRegion }}>
      <div className={`t-region ${className}`} data-region={region}>
        {children}
      </div>
    </RegionContext.Provider>
  );
}

export function RegionToggle({ compact = false }: { compact?: boolean }) {
  const { region, setRegion } = useContext(RegionContext);
  return (
    <div className={`t-toggle ${compact ? "is-compact" : ""}`} role="group" aria-label="Region">
      {(["global", "vn"] as const).map((r) => (
        <button key={r} type="button" aria-pressed={region === r} className={region === r ? "is-active" : ""} onClick={() => setRegion(r)}>
          {r === "global" ? <Globe2 size={14} aria-hidden="true" /> : <span className="t-flag" aria-hidden="true">VN</span>}
          <span className="t-toggle-long">{r === "global" ? "Global" : "Vietnam"}</span>
          <span className="t-toggle-short" aria-hidden="true">{r === "global" ? "Global" : "Vietnam"}</span>
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────── Sticky platform tabs ─────────────────────────── */

export interface TabDef {
  id: string;
  label: string;
  color: string;
  icon: React.ReactNode;
}

export function PlatformTabs({ tabs, children }: { tabs: TabDef[]; children?: React.ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const navRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sections = tabs.map((t) => document.getElementById(t.id)).filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [tabs]);
  useEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (el && navRef.current) {
      const nav = navRef.current;
      const left = el.offsetLeft - nav.clientWidth / 2 + el.clientWidth / 2;
      nav.scrollTo({ left, behavior: "smooth" });
    }
  }, [active]);
  return (
    <div className="t-tabs-bar">
      <div className="t-tabs-inner">
        <nav className="t-tabs" aria-label="Jump to a platform" ref={navRef}>
          {tabs.map((t) => (
            <a key={t.id} data-tab={t.id} href={`#${t.id}`} className={active === t.id ? "is-active" : ""} aria-current={active === t.id ? "true" : undefined} style={{ "--brand": t.color } as React.CSSProperties}>
              {t.icon}
              <span>{t.label}</span>
            </a>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
