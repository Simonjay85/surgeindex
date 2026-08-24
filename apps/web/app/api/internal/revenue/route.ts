import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "@surge/config";
import { getPostgresDb, site, siteRevenueCurrent } from "@surge/db";
import { eq } from "drizzle-orm";
import { jsonError, jsonOk, requestId } from "../../../../lib/server/http";

export const runtime = "nodejs";

const revenuePayload = z.object({
  siteId: z.string().uuid(),
  source: z.enum(["woocommerce", "ga4_ecommerce", "manual"]),
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  grossAmountCents: z.number().int().nonnegative().max(2_000_000_000),
  refundedAmountCents: z.number().int().nonnegative().max(2_000_000_000).default(0),
  orderCount: z.number().int().nonnegative().max(10_000_000),
  lastOrderAt: z.string().datetime({ offset: true }).nullable().optional(),
  periodStart: z.string().datetime({ offset: true }).nullable().optional(),
  periodEnd: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(["connected", "stale", "unavailable", "error"]).default("connected"),
  publicVisible: z.boolean().default(false),
  providerDefinitionVersion: z.string().max(64).default("revenue-v1"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

function authorized(request: Request): boolean {
  const configured = getServerEnv().INTERNAL_SERVICE_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(configured && supplied && configured.length === supplied.length && timingSafeEqual(Buffer.from(configured), Buffer.from(supplied)));
}

export async function POST(request: Request) {
  if (!authorized(request)) return jsonError(request, 401, "service_auth_required", "Internal service authentication is required.");
  const parsed = revenuePayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(request, 422, "invalid_revenue_payload", "The aggregate revenue payload is invalid.");
  const body = parsed.data;
  const db = getPostgresDb();
  const [target] = await db.select({ id: site.id, isDemo: site.isDemo }).from(site).where(eq(site.id, body.siteId)).limit(1);
  if (!target || target.isDemo) return jsonError(request, 404, "site_not_found", "The production site was not found.");
  const now = new Date();
  const gross = body.grossAmountCents;
  const refunded = Math.min(body.refundedAmountCents, gross);
  const net = gross - refunded;
  await db
    .insert(siteRevenueCurrent)
    .values({
      siteId: body.siteId,
      source: body.source,
      currency: body.currency,
      grossAmountCents: gross,
      refundedAmountCents: refunded,
      netAmountCents: net,
      orderCount: body.orderCount,
      lastOrderAt: body.lastOrderAt ? new Date(body.lastOrderAt) : null,
      periodStart: body.periodStart ? new Date(body.periodStart) : null,
      periodEnd: body.periodEnd ? new Date(body.periodEnd) : null,
      lastSyncedAt: now,
      status: body.status,
      publicVisible: body.publicVisible,
      providerDefinitionVersion: body.providerDefinitionVersion,
      metadata: body.metadata,
      updatedAt: now,
      isDemo: false,
    })
    .onConflictDoUpdate({
      target: [siteRevenueCurrent.siteId, siteRevenueCurrent.source, siteRevenueCurrent.currency],
      set: {
        grossAmountCents: gross,
        refundedAmountCents: refunded,
        netAmountCents: net,
        orderCount: body.orderCount,
        lastOrderAt: body.lastOrderAt ? new Date(body.lastOrderAt) : null,
        periodStart: body.periodStart ? new Date(body.periodStart) : null,
        periodEnd: body.periodEnd ? new Date(body.periodEnd) : null,
        lastSyncedAt: now,
        status: body.status,
        publicVisible: body.publicVisible,
        providerDefinitionVersion: body.providerDefinitionVersion,
        metadata: body.metadata,
        updatedAt: now,
        isDemo: false,
      },
    });
  return jsonOk(request, { siteId: body.siteId, source: body.source, currency: body.currency, netAmountCents: net, syncedAt: now.toISOString(), requestId: requestId(request) }, 202);
}
