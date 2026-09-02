import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { getServerEnv } from "@surge/config";
import { activityEvent, getPostgresDb, site, siteOwner, trackerEvent, trackerKey, type PostgresDatabase } from "@surge/db";

export class TrackerKeyServiceError extends Error {
  constructor(public readonly code: "site_not_found" | "ownership_required" | "tracker_not_found" | "revoked" | "rate_limited", message: string, public readonly status = 422) {
    super(message);
  }
}

type TrackerAction = "generate" | "rotate";

type TrackerKeyTransaction = Parameters<Parameters<PostgresDatabase["transaction"]>[0]>[0];

const OWNERSHIP_REQUIRED_MESSAGE = "Only an ownership-verified site can manage tracker keys.";

async function lockAuthorizedSite(tx: TrackerKeyTransaction, userId: string, siteId: string) {
  // Do not use a joined FOR UPDATE here. PostgreSQL may lock every joined
  // relation (and the planner can choose a different relation order), which
  // lets settings/claim transactions deadlock or observe a mixed snapshot.
  // Every tracker-key mutation follows this order: site -> exact membership ->
  // current key. The site row also serializes the no-key case with inserts.
  const [target] = await tx
    .select({ id: site.id, domain: site.domain, name: site.name, ownership: site.ownership, status: site.status, permittedAliases: site.permittedAliases })
    .from(site)
    .where(and(eq(site.id, siteId), eq(site.isDemo, false), sql`${site.deletedAt} is null`))
    .limit(1)
    .for("update");
  if (!target) throw new TrackerKeyServiceError("ownership_required", OWNERSHIP_REQUIRED_MESSAGE, 403);

  const [membership] = await tx
    .select({ id: siteOwner.id })
    .from(siteOwner)
    .where(and(eq(siteOwner.siteId, target.id), eq(siteOwner.userId, userId), eq(siteOwner.role, "owner")))
    .limit(1)
    .for("update");
  if (!membership) throw new TrackerKeyServiceError("ownership_required", OWNERSHIP_REQUIRED_MESSAGE, 403);
  if (target.ownership !== "claimed") throw new TrackerKeyServiceError("ownership_required", OWNERSHIP_REQUIRED_MESSAGE, 403);
  if (target.status !== "active") throw new TrackerKeyServiceError("site_not_found", "The site is not active.", 404);
  return target;
}

async function lockCurrentTrackerKey(tx: TrackerKeyTransaction, siteId: string, activeOnly = false) {
  const [current] = await tx
    .select()
    .from(trackerKey)
    .where(and(eq(trackerKey.siteId, siteId), activeOnly ? sql`${trackerKey.status} <> 'revoked'` : undefined))
    .orderBy(desc(trackerKey.version), asc(trackerKey.id))
    .limit(1)
    .for("update");
  return current;
}

async function authorizedSite(userId: string, siteId: string) {
  const db = getPostgresDb();
  const [row] = await db
    .select({ id: site.id, domain: site.domain, name: site.name, ownership: site.ownership, status: site.status, permittedAliases: site.permittedAliases })
    .from(site)
    .innerJoin(siteOwner, and(eq(siteOwner.siteId, site.id), eq(siteOwner.userId, userId), eq(siteOwner.role, "owner")))
    .where(and(eq(site.id, siteId), eq(site.isDemo, false), sql`${site.deletedAt} is null`))
    .limit(1);
  if (!row) throw new TrackerKeyServiceError("ownership_required", "Only an ownership-verified site can manage tracker keys.", 403);
  if (row.ownership !== "claimed") throw new TrackerKeyServiceError("ownership_required", "Only an ownership-verified site can manage tracker keys.", 403);
  if (row.status !== "active") throw new TrackerKeyServiceError("site_not_found", "The site is not active.", 404);
  return row;
}

export async function getTrackerKeyStatus(userId: string, siteId: string) {
  const target = await authorizedSite(userId, siteId);
  const db = getPostgresDb();
  const [key] = await db.select().from(trackerKey).where(eq(trackerKey.siteId, siteId)).orderBy(desc(trackerKey.version)).limit(1);
  if (!key) return { siteId, siteName: target.name, domain: target.domain, status: "not_installed" as const, key: null, lastEventAt: null, lastDetectedOrigin: null, trackerVersion: null, freshness: "unknown" as const, installation: installationInstructions(null, target.domain) };
  if (key.status === "revoked") return { siteId, siteName: target.name, domain: target.domain, status: "revoked" as const, key: null, lastEventAt: key.lastEventAt?.toISOString() ?? null, lastDetectedOrigin: key.lastOrigin, trackerVersion: null, freshness: "revoked" as const, installation: null };
  const [lastEvent] = await db.select({ receivedAt: trackerEvent.receivedAt, originHost: trackerEvent.originHost, trackerVersion: trackerEvent.trackerVersion }).from(trackerEvent).where(and(eq(trackerEvent.siteId, siteId), eq(trackerEvent.trackerPublicKey, key.publicKey), eq(trackerEvent.decision, "valid"), sql`${trackerEvent.trafficOrigin} <> 'paid_surgedindex_referral'`)).orderBy(desc(trackerEvent.receivedAt)).limit(1);
  const lastEventAt = key.lastEventAt ?? lastEvent?.receivedAt ?? null;
  const age = lastEventAt ? Math.max(0, Date.now() - lastEventAt.getTime()) : null;
  const ttl = getServerEnv().ACTIVE_SESSION_TTL_SECONDS * 1000;
  const status = !lastEventAt ? "waiting" : age != null && age > ttl * 2 ? "stale" : age != null && age <= ttl ? "active" : "connected";
  return {
    siteId,
    siteName: target.name,
    domain: target.domain,
    status,
    key: { publicKey: key.publicKey, version: key.version, environment: key.environment, createdAt: key.createdAt.toISOString(), allowedDomains: key.allowedDomains },
    lastEventAt: lastEventAt?.toISOString() ?? null,
    lastDetectedOrigin: lastEvent?.originHost ?? key.lastOrigin,
    trackerVersion: lastEvent?.trackerVersion ?? null,
    freshness: age == null ? "unknown" : age <= ttl ? "fresh" : age <= ttl * 2 ? "aging" : "stale",
    installation: installationInstructions(key.publicKey, target.domain),
  };
}

export async function mutateTrackerKey(input: { userId: string; siteId: string; action: TrackerAction }) {
  const db = getPostgresDb();
  await db.transaction(async (tx) => {
    const target = await lockAuthorizedSite(tx, input.userId, input.siteId);
    const current = await lockCurrentTrackerKey(tx, target.id);
    if (input.action === "generate" && current && ["active", "stale"].includes(current.status)) {
      return;
    }
    const version = (current?.version ?? 0) + 1;
    const now = new Date();
    if (current && input.action === "rotate" && current.status !== "revoked") {
      await tx.update(trackerKey).set({ status: "revoked", revokedAt: now, lastError: null }).where(and(eq(trackerKey.id, current.id), sql`${trackerKey.status} <> 'revoked'`));
    }
    const publicKey = `pk_${getServerEnv().APP_MODE === "production" ? "live" : "test"}_${randomBytes(24).toString("base64url")}`;
    await tx.insert(trackerKey).values({ siteId: target.id, publicKey, allowedDomains: [target.domain, ...target.permittedAliases.filter((alias) => alias !== target.domain)], status: "active", version, environment: getServerEnv().APP_MODE, activatedAt: now });
    await tx.insert(activityEvent).values({ type: input.action === "rotate" ? "tracker_key_rotated" : "tracker_key_generated", siteId: target.id, detail: input.action === "rotate" ? "Tracker key rotated by an authorized owner." : "Tracker key generated by an authorized owner.", isDemo: false });
  });
  return getTrackerKeyStatus(input.userId, input.siteId);
}

export async function revokeTrackerKey(userId: string, siteId: string) {
  const db = getPostgresDb();
  await db.transaction(async (tx) => {
    const target = await lockAuthorizedSite(tx, userId, siteId);
    const current = await lockCurrentTrackerKey(tx, target.id, true);
    if (!current) throw new TrackerKeyServiceError("tracker_not_found", "No active tracker key exists for this site.", 404);
    const now = new Date();
    const [revoked] = await tx
      .update(trackerKey)
      .set({ status: "revoked", revokedAt: now })
      .where(and(eq(trackerKey.id, current.id), sql`${trackerKey.status} <> 'revoked'`))
      .returning({ id: trackerKey.id });
    if (!revoked) throw new TrackerKeyServiceError("tracker_not_found", "No active tracker key exists for this site.", 404);
    await tx.insert(activityEvent).values({ type: "tracker_key_revoked", siteId: target.id, detail: "Tracker key revoked by an authorized owner.", isDemo: false });
  });
  return getTrackerKeyStatus(userId, siteId);
}

export async function testTrackerInstallation(userId: string, siteId: string, sinceIso?: string) {
  await authorizedSite(userId, siteId);
  const db = getPostgresDb();
  const [key] = await db.select({ publicKey: trackerKey.publicKey, status: trackerKey.status }).from(trackerKey).where(eq(trackerKey.siteId, siteId)).orderBy(desc(trackerKey.version)).limit(1);
  if (!key || key.status === "revoked") return { accepted: false, event: null };
  const since = new Date(sinceIso ?? Date.now() - 10 * 60 * 1000);
  const [event] = await db.select({ eventId: trackerEvent.eventId, receivedAt: trackerEvent.receivedAt, originHost: trackerEvent.originHost, decision: trackerEvent.decision }).from(trackerEvent).where(and(eq(trackerEvent.siteId, siteId), eq(trackerEvent.trackerPublicKey, key.publicKey), eq(trackerEvent.decision, "valid"), sql`${trackerEvent.trafficOrigin} <> 'paid_surgedindex_referral'`, gt(trackerEvent.receivedAt, since))).orderBy(desc(trackerEvent.receivedAt)).limit(1);
  return { accepted: Boolean(event), event: event ? { eventId: event.eventId, receivedAt: event.receivedAt.toISOString(), originHost: event.originHost } : null };
}

function installationInstructions(publicKey: string | null, domain: string) {
  if (!publicKey) return null;
  const env = getServerEnv();
  const src = absoluteUrl(env.TRACKER_PUBLIC_URL);
  const collector = absoluteUrl(env.TRACKER_COLLECTOR_URL);
  const snippet = `<script defer src="${src}" data-site="${publicKey}" data-collector="${collector}"></script>`;
  return {
    publicKey,
    collectorUrl: collector,
    domain,
    snippet,
    tabs: {
      html: ["Paste the snippet immediately before </head> on every page.", "Keep data-site equal to the public key; do not replace it with a database ID.", "Publish the page, then use Test installation."],
      nextjs: ["Add the snippet to app/layout.tsx or pages/_document.tsx.", "Use next/script with strategy=afterInteractive or the plain defer script.", "Verify the deployed origin matches the approved domain."],
      wordpress: ["Add the snippet in the site header through a child theme or a header-injection plugin.", "Do not paste it into post content.", "Clear page-cache/CDN cache before testing."],
      shopify: ["Open Online Store → Themes → Edit code → theme.liquid.", "Paste before </head> and save the theme.", "Test on the published storefront, not only the editor preview."],
      webflow: ["Open Project settings → Custom code → Head code.", "Paste the snippet and publish the project.", "Test the published domain."],
      gtm: ["Create a Custom HTML tag containing the snippet.", "Trigger it on All Pages with consent settings matching your policy.", "Publish the container, then test the live site."],
    },
  };
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, getServerEnv().NEXT_PUBLIC_APP_URL).toString();
  } catch {
    return value;
  }
}
