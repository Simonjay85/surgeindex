"use client";

/* eslint-disable @next/next/no-img-element -- generated share PNGs are served by our own route; no optimizer needed */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface SharePreviewSlide {
  src: string;
  alt: string;
  label: string;
  color: string;
}

const INTERVAL_MS = 4000;

/**
 * Hero slideshow of the real share PNGs: auto-advances every 4s, pauses on
 * hover / keyboard focus / hidden tab, and never auto-plays when the visitor
 * prefers reduced motion (arrows and dots still work).
 */
export function SharePreview({ slides, labels }: { slides: SharePreviewSlide[]; labels: { region: string; prev: string; next: string; goTo: string } }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const count = slides.length;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || reduced || count < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((i) => (i + 1) % count);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused, reduced, count]);

  if (!count) return null;
  return (
    <div
      ref={root}
      className="t-sp"
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.region}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1);
        if (e.key === "ArrowRight") go(index + 1);
      }}
    >
      <div className="t-sp-stage">
        <div className="t-sp-back" aria-hidden="true" />
        <div className="t-sp-card">
          {slides.map((s, i) => (
            <img
              key={s.src}
              src={s.src}
              alt={s.alt}
              width={1080}
              height={1350}
              className={i === index ? "is-active" : undefined}
              aria-hidden={i === index ? undefined : true}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={i === 0 ? "high" : "low"}
            />
          ))}
        </div>
      </div>
      <div className="t-sp-controls">
        <button type="button" className="t-sp-arrow" onClick={() => go(index - 1)} aria-label={labels.prev}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="t-sp-dots">
          {slides.map((s, i) => (
            <button
              key={s.src}
              type="button"
              className={i === index ? "is-active" : undefined}
              style={{ "--brand": s.color } as React.CSSProperties}
              onClick={() => go(i)}
              aria-label={`${labels.goTo} ${s.label}`}
              aria-current={i === index ? "true" : undefined}
            />
          ))}
        </div>
        <button type="button" className="t-sp-arrow" onClick={() => go(index + 1)} aria-label={labels.next}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="t-sp-caption" aria-live="polite">
        <span style={{ color: slides[index]!.color }}>●</span> {slides[index]!.label} · {index + 1}/{count}
      </p>
    </div>
  );
}
