"use client";

import { useRef, useState } from "react";
import { Pause, Play, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const movingSites = [
  { name: "QueryNest", signal: "+4", direction: "up" },
  { name: "StackBeacon", signal: "+2", direction: "up" },
  { name: "OrbitNotes", signal: "+7", direction: "up" },
  { name: "ShopSignal", signal: "-2", direction: "down" },
  { name: "Nimbus", signal: "+1", direction: "up" },
] as const;

const tapeEvents = [
  "LaunchPilot +5",
  "OrbitNotes +7",
  "QueryNest +4",
  "StackBeacon +2",
  "ShopSignal -2",
];

const signalModes = [
  {
    title: "Rank rise",
    value: "+5",
    description: "A verified traffic surge moves a website through five occupied positions.",
    icon: TrendingUp,
  },
  {
    title: "Rank drop",
    value: "-2",
    description: "A cooling signal pushes the website down while nearby positions close the gap.",
    icon: TrendingDown,
  },
  {
    title: "Breakout signal",
    value: "3.1x",
    description: "Momentum crosses its recent baseline and becomes a visible breakout event.",
    icon: Zap,
  },
] as const;

function EventTape() {
  const [paused, setPaused] = useState(false);

  return (
    <div className="event-tape" data-paused={paused ? "true" : "false"}>
      <div className="event-tape-viewport" aria-label="Demo ranking events">
        <div className="event-tape-track">
          {[0, 1].map((copy) => (
            <div className="event-tape-copy" aria-hidden={copy === 1} key={copy}>
              {tapeEvents.map((event) => (
                <span className="event-tape-item" key={`${copy}-${event}`}>
                  <span className="event-tape-dot" />
                  {event}
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

function SignalAccordion() {
  const [active, setActive] = useState(0);

  return (
    <div className="rank-signal-accordion" aria-label="Ranking signal examples">
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

export function RankMomentumShowcase() {
  const container = useRef<HTMLElement>(null);

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

          if (!stage || !jumper || !badge) return;

          const rowStep = () => {
            const value = getComputedStyle(stage).getPropertyValue("--rank-row-step");
            return Number.parseFloat(value) || 68;
          };

          gsap.set([jumper, passedRows], { y: 0 });
          gsap.set(stage, { autoAlpha: 1, scale: 1 });
          gsap.set(badge, { autoAlpha: 0, scale: 0.76 });
          gsap.set([...ripples, ...streaks], { autoAlpha: 0 });

          if (!desktop || reducedMotion) {
            gsap.set(jumper, { y: () => -5 * rowStep() });
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
            .to(jumper, { y: () => -5 * rowStep(), duration: 0.48 }, 0.24)
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
    { scope: container },
  );

  return (
    <section className="rank-momentum-section" ref={container}>
      <EventTape />
      <div className="rank-momentum-pin">
        <div className="container rank-momentum-grid">
          <div className="rank-momentum-copy">
            <p className="rank-momentum-kicker">Demo ranking event</p>
            <h2>
              One jump.
              <span className="inline-signal-window" aria-hidden="true">
                <svg viewBox="0 0 92 34" role="presentation">
                  <path d="M3 27 C15 27 18 22 28 23 S41 18 49 19 S60 12 67 13 S77 5 89 6" />
                </svg>
              </span>
              Five positions.
            </h2>
            <p>
              LaunchPilot moves from #8 to #3 after a verified traffic surge. Scroll to follow how
              every occupied position responds.
            </p>
            <div className="rank-momentum-readout" aria-label="LaunchPilot ranking change from 8 to 3">
              <span>#8</span>
              <span className="rank-momentum-readout-line" />
              <strong>#3</strong>
            </div>
          </div>

          <div className="rank-event-stage" aria-label="Animated demo of LaunchPilot rising five ranking positions">
            <div className="rank-event-stage-topline">
              <div>
                <span>Momentum simulator</span>
                <strong>Verified traffic event</strong>
              </div>
              <span className="rank-jump-badge">+5 places</span>
            </div>

            <div className="rank-event-board">
              <div className="rank-event-slots" aria-hidden="true">
                {[2, 3, 4, 5, 6, 7, 8].map((rank) => (
                  <span key={rank}>#{rank}</span>
                ))}
              </div>

              <div className="rank-event-list">
                <div className="rank-event-row rank-event-anchor">
                  <span className="rank-event-mark rank-event-mark-plum">P</span>
                  <span><strong>PixelForge</strong><small>516 online</small></span>
                  <span className="rank-event-change is-flat">flat</span>
                </div>
                {movingSites.map((site, index) => (
                  <div className="rank-event-row rank-event-pass" key={site.name}>
                    <span className={`rank-event-mark rank-event-mark-${index + 1}`}>{site.name[0]}</span>
                    <span><strong>{site.name}</strong><small>{377 - index * 39} online</small></span>
                    <span className={`rank-event-change is-${site.direction}`}>{site.signal}</span>
                  </div>
                ))}
                <div className="rank-event-row rank-event-jumper">
                  <span className="rank-event-mark rank-event-mark-coral">L</span>
                  <span><strong>LaunchPilot</strong><small>842 online</small></span>
                  <span className="rank-event-change is-up">+265%</span>
                </div>
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
          <SignalAccordion />
        </div>
      </div>
    </section>
  );
}
