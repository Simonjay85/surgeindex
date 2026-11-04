/**
 * Rule-based anti-fraud scoring for tracker events and outbound clicks.
 *
 * Deterministic, versioned, and explainable. Exact thresholds are deliberately
 * NOT published to end users (see /methodology wording) — do not copy these
 * constants into public pages.
 */

import type { FraudDecision } from "@surge/shared";

export const FRAUD_RULE_VERSION = "v1";

export type TrackerEventType =
  | "pageview"
  | "session_start"
  | "heartbeat"
  | "engaged"
  | "session_end";

export interface FraudCheckInput {
  eventType: TrackerEventType;
  userAgent: string | null;
  /** Host from the Origin header, if the browser sent one. */
  originHost: string | null;
  /** Host from the Referer header, if present. */
  refererHost: string | null;
  /** Domains registered for this site key. */
  allowedDomains: string[];
  /** Client-supplied timestamp (never trusted; checked for skew). */
  claimedOccurredAt: string | null;
  serverNow: Date;
  /** Milliseconds since this session's previous heartbeat, when known. */
  msSinceLastHeartbeat: number | null;
  /** Events from this visitor in the last 60s, when known. */
  visitorEventsLastMinute: number | null;
  /** Events in this session in the last 60s, when known. */
  sessionEventsLastMinute: number | null;
  /** True when this exact event id was already seen. */
  duplicateEventId: boolean;
  /** Session age in ms at the time of a session_end event. */
  sessionDurationMs: number | null;
  viewport: string | null;
  /** Pluggable hook: datacenter/ASN heuristics from the collector. */
  datacenterSignal: boolean | null;
  /** Collector-level key and shape failures are explicit reason codes. */
  invalidTrackerKey?: boolean;
  revokedTrackerKey?: boolean;
  malformedIdentifier?: boolean;
  replayedBatch?: boolean;
  attributionTokenReplay?: boolean;
  invalidEngagement?: boolean;
  suspiciousReferrer?: boolean;
}

export interface FraudVerdict {
  decision: FraudDecision;
  /** Suspicion score 0-100. */
  score: number;
  /** Machine-readable reason codes, stored with the event. */
  reasons: string[];
  ruleVersion: string;
}

const BOT_UA_RE =
  /(bot|crawler|spider|scrape|curl|wget|python-requests|python-urllib|http-client|axios\/|node-fetch|phantomjs|headlesschrome|puppeteer|playwright|selenium|fiddler|okhttp|libwww|go-http-client)/i;

interface Signal {
  code: string;
  points: number;
}

export function checkTrackerEvent(input: FraudCheckInput): FraudVerdict {
  const signals: Signal[] = [];

  if (input.invalidTrackerKey) signals.push({ code: "invalid_tracker_key", points: 100 });
  if (input.revokedTrackerKey) signals.push({ code: "revoked_tracker_key", points: 100 });
  if (input.malformedIdentifier) signals.push({ code: "malformed_identifier", points: 100 });
  if (input.replayedBatch) signals.push({ code: "replayed_batch", points: 75 });
  if (input.attributionTokenReplay) signals.push({ code: "attribution_token_replay", points: 75 });
  if (input.invalidEngagement) signals.push({ code: "invalid_engagement_duration", points: 75 });
  if (input.suspiciousReferrer) signals.push({ code: "suspicious_referrer", points: 40 });

  if (input.userAgent && BOT_UA_RE.test(input.userAgent)) {
    signals.push({ code: "bot_user_agent", points: 60 });
  }
  if (!input.userAgent) {
    signals.push({ code: "missing_user_agent", points: 25 });
  }

  const originish = input.originHost ?? input.refererHost;
  if (input.allowedDomains.length > 0) {
    if (!originish || !hostAllowed(originish, input.allowedDomains)) {
      signals.push({ code: "invalid_site_origin", points: 55 });
    }
  } else if (!originish) {
    signals.push({ code: "missing_origin", points: 10 });
  }

  if (input.duplicateEventId) {
    signals.push({ code: "duplicate_event_id", points: 70 });
  }

  if (input.claimedOccurredAt) {
    const skewMs = Math.abs(input.serverNow.getTime() - new Date(input.claimedOccurredAt).getTime());
    if (Number.isFinite(skewMs) && skewMs > 10 * 60 * 1000) {
      signals.push({ code: "timestamp_skew", points: 30 });
    }
  }

  if (
    input.eventType === "heartbeat" &&
    input.msSinceLastHeartbeat !== null &&
    input.msSinceLastHeartbeat >= 0 &&
    input.msSinceLastHeartbeat < 15_000
  ) {
    signals.push({ code: "impossible_heartbeat_timing", points: 45 });
  }

  if (input.eventType === "heartbeat" && input.msSinceLastHeartbeat !== null && input.msSinceLastHeartbeat < 0) {
    signals.push({ code: "heartbeat_out_of_order", points: 65 });
  }

  if (input.visitorEventsLastMinute !== null && input.visitorEventsLastMinute > 30) {
    signals.push({ code: "visitor_rate_exceeded", points: 45 });
  }
  if (input.sessionEventsLastMinute !== null && input.sessionEventsLastMinute > 60) {
    signals.push({ code: "session_flood", points: 40 });
  }

  if (
    input.eventType === "session_end" &&
    input.sessionDurationMs !== null &&
    input.sessionDurationMs >= 0 &&
    input.sessionDurationMs < 2_000
  ) {
    signals.push({ code: "impossible_session_duration", points: 30 });
  }

  if (input.eventType === "pageview" && !input.viewport && !input.userAgent) {
    signals.push({ code: "missing_browser_characteristics", points: 15 });
  }

  if (input.datacenterSignal) {
    signals.push({ code: "datacenter_signal", points: 25 });
  }

  return verdict(signals);
}

/** Fraud check for outbound /go clicks. */
export interface ClickCheckInput {
  userAgent: string | null;
  /** Clicks from this anonymous visitor in the last 10 minutes. */
  visitorClicksLast10m: number | null;
}

export function checkOutboundClick(input: ClickCheckInput): FraudVerdict {
  const signals: Signal[] = [];
  if (input.userAgent && BOT_UA_RE.test(input.userAgent)) {
    signals.push({ code: "bot_user_agent", points: 70 });
  }
  if (input.visitorClicksLast10m !== null && input.visitorClicksLast10m > 20) {
    signals.push({ code: "click_rate_exceeded", points: 45 });
  }
  return verdict(signals);
}

function verdict(signals: Signal[]): FraudVerdict {
  const score = Math.min(
    100,
    signals.reduce((sum, s) => sum + s.points, 0),
  );
  const reasons = signals.map((s) => s.code);
  let decision: FraudDecision = "valid";
  if (score > 0) decision = "suspected";
  if (score >= 40) decision = "invalid";
  if (signals.some((s) => s.code === "datacenter_signal") && score < 40) {
    // ASN heuristics can false-positive — send for review instead.
    decision = "review_required";
  }
  return { decision, score, reasons, ruleVersion: FRAUD_RULE_VERSION };
}

function hostAllowed(host: string, allowedDomains: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return allowedDomains.some((d) => {
    const dd = d.toLowerCase().replace(/^www\./, "");
    return h === dd || h.endsWith(`.${dd}`);
  });
}

/** Persisted penalty fed into the Heat Score (0..1). */
export function fraudPenaltyFor(decision: FraudDecision): number {
  switch (decision) {
    case "invalid":
      return 1;
    case "review_required":
      return 0.5;
    case "suspected":
      return 0.25;
    default:
      return 0;
  }
}
