"use client";

import { useRef, useState } from "react";
import { Pause, Play, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { DemoSite } from "../lib/demo-data";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const MAX_PASSING_ROWS = 5;
const BOARD_ROW_COUNT = 7;

export interface RankMomentumModel {
  mover: DemoSite;
  anchor: DemoSite;
  passers: DemoSite[];
  fromRank: number;
  toRank: number;
  jump: number;
  slotRanks: number[];
}

export interface RankMomentumShowcaseProps {
  sites: DemoSite[];
  isDemo: boolean;
}

function getRankedSites(sites: DemoSite[]) {
  return sites
    .filter((site) => Number.isInteger(site.rank) && site.rank > 0)
    .sort((a, b) => a.rank - b.rank || b.heatScore - a.heatScore);
}

function rankDelta(site: DemoSite) {
  return site.previousRank != null && site.rank > 0 ? site.previousRank - site.rank : site.rankMovement;
}

/**
 * Selects a movement only when the public payload includes every occupied row
 * needed to tell the story. A partial payload is not animated as if it were a
 * complete ranking event.
 */
export function buildRankMomentumModel(sites: DemoSite[]): RankMomentumModel | null {
  const rankedSites = getRankedSites(sites);
  const sitesByRank = new Map(rankedSites.map((site) => [site.rank, site]));
  const candidates = rankedSites
    .filter(
      (site) =>
        rankDelta(site) > 0 &&
        site.previousRank != null &&
        site.previousRank > site.rank &&
        site.rank > 1,
    )
    .sort(
      (a, b) =>
        rankDelta(b) - rankDelta(a) ||
        (b.previousRank ?? 0) - (a.previousRank ?? 0) ||
        a.rank - b.rank,
    );

  for (const mover of candidates) {
    const fromRank = mover.previousRank;
    if (fromRank == null) continue;

    const jump = fromRank - mover.rank;
    if (jump < 1 || jump > MAX_PASSING_ROWS) continue;

    const anchor = sitesByRank.get(mover.rank - 1);
    const passers = Array.from({ length: jump }, (_, index) => sitesByRank.get(mover.rank + index + 1)).filter(
      (site): site is DemoSite => Boolean(site && site.siteId !== mover.siteId),
    );

    if (!anchor || passers.length !== jump) continue;

    return {
      mover,
      anchor,
      passers,
      fromRank,
      toRank: mover.rank,
      jump,
      slotRanks: Array.from({ length: BOARD_ROW_COUNT }, (_, index) => mover.rank - 1 + index),
    };
  }

  return null;
}

function formatRank(rank: number) {
  return rank > 0 ? `#${rank}` : "—";
}

function formatMovement(site: DemoSite) {
  const movement = rankDelta(site);
  if (movement > 0) return `+${movement}`;
  if (movement < 0) return `${movement}`;
  return "flat";
}

function movementDirection(site: DemoSite) {
  const movement = rankDelta(site);
  if (movement > 0) return "up";
  if (movement < 0) return "down";
  return "flat";
}

function formatVolume(site: DemoSite) {
  const formatter = new Intl.NumberFormat("en-US");
  if (site.activeNow != null) return `${formatter.format(site.activeNow)} active now`;
  if (site.visitors != null) return `${formatter.format(site.visitors)} visitors / 24h`;
  return "No verified volume";
}

function siteInitial(site: DemoSite) {
  return site.name.trim().slice(0, 1).toUpperCase() || "?";
}

function EventTape({ events, isDemo }: { events: DemoSite[]; isDemo: boolean }) {
  const [paused, setPaused] = useState(false);
  const tapeEvents = events.filter((site) => rankDelta(site) !== 0);

  return (
    <div className="event-tape" data-paused={paused ? "true" : "false"}>
      <div className="event-tape-viewport" aria-label={isDemo ? "Demo ranking events" : "Recorded ranking events"}>
        <div className="event-tape-track">
          {[0, 1].map((copy) => (
            <div className="event-tape-copy" aria-hidden={copy === 1} key={copy}>
              {tapeEvents.map((site) => (
                <span className="event-tape-item" key={`${copy}-${site.siteId}`}>
                  <span className="event-tape-dot" />
                  {site.name} {formatMovement(site)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <button
        aria-label={paused ? "Resume ranking event tape" : "Pause ranking event tape"}
        aria-pressed={paused}
        className="event-tape-control"
        onClick={() => setPaused((current) => !current)}
        type="button"
      >
        {paused ? <Play aria-hidden size={15} /> : <Pause aria-hidden size={15} />}
        <span>{paused ? "Resume" : "Pause"}</span>
      </button>
    </div>
  );
}

function SignalAccordion({ sites, model }: { sites: DemoSite[]; model: RankMomentumModel }) {
  const [active, setActive] = useState(0);
  const drop = sites
    .filter((site) => rankDelta(site) < 0 && site.previousRank != null && site.rank > 0)
    .sort((a, b) => rankDelta(a) - rankDelta(b))[0];
  const breakout = sites
    .filter((site) => site.breakoutMultiple > 0)
    .sort((a, b) => b.breakoutMultiple - a.breakoutMultiple)[0];
  const signalModes = [
    {
      title: "Rank rise",
      value: `+${model.jump}`,
      description: `${model.mover.name} moved from ${formatRank(model.fromRank)} to ${formatRank(model.toRank)} in the public index.`,
      icon: TrendingUp,
    },
    {
      title: "Rank drop",
      value: drop ? formatMovement(drop) : "—",
      description: drop
        ? `${drop.name} moved from ${formatRank(drop.previousRank ?? 0)} to ${formatRank(drop.rank)}.`
        : "No verified rank drop is available in this update.",
      icon: TrendingDown,
    },
    {
      title: "Breakout signal",
      value: breakout ? `${breakout.breakoutMultiple.toFixed(1)}×` : "—",
      description: breakout
        ? `${breakout.name} is showing a ${breakout.breakoutMultiple.toFixed(1)}× attention multiple against its measured baseline.`
        : "No measured breakout signal is available in this update.",
      icon: Zap,
    },
  ] as const;

  return (
    <div className="rank-signal-accordion" aria-label="Ranking signals from the public index">
      {signalModes.map((mode, index) => {
        const Icon = mode.icon;
        const isActive = active === index;

        return (
          <button
            aria-expanded={isActive}
            className={`rank-signal-item${isActive ? " is-active" : ""}`}
            key={mode.title}
            onClick={() => setActive(index)}
            type="button"
          >
            <span className="rank-signal-item-topline">
              <Icon aria-hidden size={16} />
              <span>{mode.title}</span>
              <strong>{mode.value}</strong>
            </span>
            <span className="rank-signal-description">{mode.description}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RankMomentumShowcase({ sites, isDemo }: RankMomentumShowcaseProps) {
  const container = useRef<HTMLElement>(null);
  const model = buildRankMomentumModel(sites);

  useGSAP(
    () => {
      const media = gsap.matchMedia();

      media.add(
        {
          desktop: "(min-width: 900px)",
          reducedMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { desktop, reducedMotion } = context.conditions as {
            desktop: boolean;
            reducedMotion: boolean;
          };
          const stage = container.current?.querySelector<HTMLElement>(".rank-event-stage");
          const jumper = container.current?.querySelector<HTMLElement>(".rank-event-jumper");
          const passedRows = gsap.utils.toArray<HTMLElement>(".rank-event-pass", container.current);
          const badge = container.current?.querySelector<HTMLElement>(".rank-jump-badge");
          const ripples = gsap.utils.toArray<HTMLElement>(".rank-event-ripple", container.current);
          const streaks = gsap.utils.toArray<HTMLElement>(".rank-event-streak", container.current);

          if (!stage || !jumper || !badge || !model) return;

          const rowStep = () => {
            const value = getComputedStyle(stage).getPropertyValue("--rank-row-step");
            return Number.parseFloat(value) || 68;
          };

          gsap.set([jumper, passedRows], { y: 0 });
          gsap.set(stage, { autoAlpha: 1, scale: 1 });
          gsap.set(badge, { autoAlpha: 0, scale: 0.76 });
          gsap.set([...ripples, ...streaks], { autoAlpha: 0 });

          if (!desktop || reducedMotion) {
            gsap.set(jumper, { y: () => -model.jump * rowStep() });
            gsap.set(passedRows, { y: () => rowStep() });
            gsap.set(badge, { autoAlpha: 1, scale: 1 });
            return;
          }

          const timeline = gsap.timeline({
            defaults: { ease: "power3.inOut" },
            scrollTrigger: {
              trigger: container.current,
              pin: ".rank-momentum-pin",
              start: "top top+=84",
              end: "+=1180",
              scrub: 0.65,
              invalidateOnRefresh: true,
            },
          });

          timeline
            .fromTo(
              stage,
              { autoAlpha: 0.45, scale: 0.84 },
              { autoAlpha: 1, scale: 1, duration: 0.23, ease: "power3.out" },
            )
            .to(jumper, { y: () => -model.jump * rowStep(), duration: 0.48 }, 0.24)
            .to(passedRows, { y: () => rowStep(), duration: 0.42 }, 0.28)
            .fromTo(
              badge,
              { autoAlpha: 0, scale: 0.76 },
              { autoAlpha: 1, scale: 1, duration: 0.18, ease: "back.out(1.7)" },
              0.61,
            )
            .fromTo(
              ripples,
              { autoAlpha: 0.72, scale: 0.22 },
              { autoAlpha: 0, scale: 2.35, duration: 0.24, stagger: 0.035, ease: "power2.out" },
              0.61,
            )
            .fromTo(
              streaks,
              { autoAlpha: 0, y: 16, scaleY: 0.45 },
              { autoAlpha: 0.8, y: -18, scaleY: 1, duration: 0.1, stagger: 0.015 },
              0.59,
            )
            .to(streaks, { autoAlpha: 0, y: -42, duration: 0.14, stagger: 0.012 }, 0.7)
            .to(stage, { autoAlpha: 0.76, scale: 0.96, duration: 0.16, ease: "power2.inOut" }, 0.84);
        },
      );

      return () => media.revert();
    },
    {
      scope: container,
      dependencies: [model?.mover.siteId, model?.fromRank, model?.toRank],
      revertOnUpdate: true,
    },
  );

  if (!model) {
    return (
      <section className="rank-momentum-section" ref={container}>
        <div className="container rank-momentum-empty empty-state">
          <p className="rank-momentum-kicker">{isDemo ? "Demo ranking event" : "Recorded ranking event"}</p>
          <h2>Rank movement will appear when the index has enough history.</h2>
          <p>
            We need a current rank, a previous rank, and the occupied positions between them before we animate a
            movement. No fixture or inferred position is shown here.
          </p>
        </div>
      </section>
    );
  }

  const eventSites = [model.mover, ...model.passers].filter(
    (site, index, all) =>
      rankDelta(site) !== 0 && all.findIndex((candidate) => candidate.siteId === site.siteId) === index,
  );
  const placeholderCount = BOARD_ROW_COUNT - (model.jump + 2);

  return (
    <section className="rank-momentum-section" ref={container}>
      <EventTape events={eventSites.length ? eventSites : [model.mover]} isDemo={isDemo} />
      <div className="rank-momentum-pin">
        <div className="container rank-momentum-grid">
          <div className="rank-momentum-copy">
            <p className="rank-momentum-kicker">{isDemo ? "Demo ranking event" : "Verified ranking event"}</p>
            <h2>
              One jump.
              <span className="inline-signal-window" aria-hidden="true" />
              {model.jump} {model.jump === 1 ? "position." : "positions."}
            </h2>
            <p>
              {model.mover.name} moved from {formatRank(model.fromRank)} to {formatRank(model.toRank)} after a recorded
              ranking update. Scroll to follow how the occupied positions respond.
            </p>
            <div
              className="rank-momentum-readout"
              aria-label={`${model.mover.name} ranking change from ${formatRank(model.fromRank)} to ${formatRank(model.toRank)}`}
            >
              <span>{formatRank(model.fromRank)}</span>
              <span className="rank-momentum-readout-line" />
              <strong>{formatRank(model.toRank)}</strong>
            </div>
          </div>

          <div className="rank-event-stage" aria-label={`Animated ranking update for ${model.mover.name}`}>
            <div className="rank-event-stage-topline">
              <div>
                <span>{isDemo ? "Demo momentum simulator" : "Momentum index"}</span>
                <strong>Recorded ranking update</strong>
              </div>
              <span className="rank-jump-badge">+{model.jump} places</span>
            </div>

            <div className="rank-event-board">
              <div className="rank-event-slots" aria-hidden="true">
                {model.slotRanks.map((rank) => (
                  <span key={rank}>#{rank}</span>
                ))}
              </div>

              <div className="rank-event-list">
                <div className="rank-event-row rank-event-anchor">
                  <span className="rank-event-mark rank-event-mark-plum">{siteInitial(model.anchor)}</span>
                  <span>
                    <strong>{model.anchor.name}</strong>
                    <small>{formatVolume(model.anchor)}</small>
                  </span>
                  <span className={`rank-event-change is-${movementDirection(model.anchor)}`}>{formatMovement(model.anchor)}</span>
                </div>
                {model.passers.map((site, index) => (
                  <div className="rank-event-row rank-event-pass" key={site.siteId}>
                    <span className={`rank-event-mark rank-event-mark-${(index % 5) + 1}`}>{siteInitial(site)}</span>
                    <span>
                      <strong>{site.name}</strong>
                      <small>{formatVolume(site)}</small>
                    </span>
                    <span className={`rank-event-change is-${movementDirection(site)}`}>{formatMovement(site)}</span>
                  </div>
                ))}
                <div className="rank-event-row rank-event-jumper">
                  <span className="rank-event-mark rank-event-mark-coral">{siteInitial(model.mover)}</span>
                  <span>
                    <strong>{model.mover.name}</strong>
                    <small>{formatVolume(model.mover)}</small>
                  </span>
                  <span className={`rank-event-change is-${movementDirection(model.mover)}`}>{formatMovement(model.mover)}</span>
                </div>
                {Array.from({ length: Math.max(0, placeholderCount) }).map((_, index) => (
                  <div className="rank-event-row rank-event-placeholder" aria-hidden="true" key={`placeholder-${index}`} />
                ))}
              </div>

              <div className="rank-event-impact" aria-hidden="true">
                <span className="rank-event-ripple" />
                <span className="rank-event-ripple" />
                {Array.from({ length: 6 }).map((_, index) => (
                  <span className="rank-event-streak" key={index} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <SignalAccordion sites={sites} model={model} />
        </div>
      </div>
    </section>
  );
}
