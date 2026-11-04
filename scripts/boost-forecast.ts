import { getServerEnv } from "@surge/config";

async function main() {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres" || !env.BOOST_ENABLED) {
    console.log(JSON.stringify({ status: "disabled", reason: "Boost forecasting requires production Postgres with BOOST_ENABLED=true." }, null, 2));
    return;
  }
  const args = new Map(process.argv.slice(2).map((value) => { const [key, val] = value.split("=", 2); return [key, val ?? "true"]; }));
  const siteId = args.get("--site-id");
  const packageKey = args.get("--package") ?? "starter";
  const placementKey = args.get("--placement") ?? "homepage_boosted";
  if (!siteId) throw new Error("--site-id is required");
  const pkg = (await import("../apps/web/lib/server/boost-config")).getBoostPackage(packageKey);
  if (!pkg?.targetQualifiedImpressions) throw new Error("package is not payable or requires a server quote");
  const { forecastBoostInventory } = await import("../apps/web/lib/server/boost-service");
  const startsAt = new Date(args.get("--starts-at") ?? Date.now() + 30 * 60 * 1000);
  const endsAt = new Date(args.get("--ends-at") ?? startsAt.getTime() + pkg.defaultDurationDays * 24 * 60 * 60 * 1000);
  console.log(JSON.stringify(await forecastBoostInventory({ userId: args.get("--user-id") ?? "", siteId, placementKey, startsAt, endsAt, requestedImpressions: pkg.targetQualifiedImpressions }), null, 2));
}

void main();
