import Stripe from "stripe";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { closeDb } from "@surge/db";
import { getServerEnv } from "@surge/config";

// The replay utility is a Node operator command, while the canonical processor
// is also imported by Next server routes and therefore includes Next's
// server-only guard. Load it after a narrowly scoped CLI shim so the command can
// execute on the VPS without weakening the guard in application bundles.
const nodeModule = createRequire(import.meta.url)("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalModuleLoad = nodeModule._load;
nodeModule._load = (request, parent, isMain) => request === "server-only" ? {} : originalModuleLoad(request, parent, isMain);

const eventId = process.argv.find((value) => value.startsWith("--event="))?.slice("--event=".length);
const env = getServerEnv();
if (!eventId || !/^evt_[A-Za-z0-9]+$/.test(eventId)) throw new Error("Pass --event=<Stripe event id>.");
if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.STRIPE_ENABLED) throw new Error("Stripe replay requires production Postgres with Stripe enabled.");
if (process.env.STRIPE_REPLAY_CONFIRM !== "YES") throw new Error("Set STRIPE_REPLAY_CONFIRM=YES after reviewing the event in the Stripe Dashboard.");
if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) throw new Error("Stripe replay requires the configured provider and webhook secrets.");

async function main() {
  const { processStripeWebhook } = await import("../apps/web/lib/server/stripe-service");
  const client = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: env.STRIPE_API_VERSION as Stripe.LatestApiVersion });
  const event = await client.events.retrieve(eventId);
  const rawBody = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: env.STRIPE_WEBHOOK_SECRET });
  const result = await processStripeWebhook({ rawBody, signature, requestId: `stripe-replay:${randomUUID()}`, replay: true });
  console.log(JSON.stringify({ status: "replayed", eventId: result.eventId, type: result.type, duplicate: result.duplicate, note: "Replay uses the canonical webhook processor and remains idempotent." }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Stripe replay failed.");
  process.exitCode = 1;
}).finally(async () => {
  await closeDb();
});
