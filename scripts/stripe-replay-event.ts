import { getServerEnv } from "@surge/config";

const eventId = process.argv.find((value) => value.startsWith("--event="))?.slice("--event=".length);
const env = getServerEnv();
console.log(JSON.stringify({ status: env.APP_MODE === "production" && env.DATA_PROVIDER === "postgres" && env.STRIPE_ENABLED ? "requires_admin_reconciliation" : "disabled", eventId: eventId ?? null, note: "Replay is intentionally not available without an authenticated admin/provider fetch path." }, null, 2));
