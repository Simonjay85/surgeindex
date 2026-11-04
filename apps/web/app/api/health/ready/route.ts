import { sql } from "drizzle-orm";
import { getServerEnv } from "@surge/config";
import { getPostgresDb } from "@surge/db";
import { jsonOk } from "../../../../lib/server/http";

export const runtime = "nodejs";

/**
 * Readiness is a non-secret operational projection. It intentionally does not
 * return raw database errors, URLs, migration hashes, or provider credentials.
 */
export async function GET(request: Request) {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return jsonOk(request, { ready: false, checks: { configuration: false, database: false, migrations: false } }, 503);
  }

  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres") {
    return jsonOk(request, {
      ready: true,
      mode: env.APP_MODE,
      checks: { configuration: true, database: false, migrations: false },
      note: "Demo readiness does not assert production dependencies.",
    });
  }

  let database = false;
  let migrations = false;
  try {
    const db = getPostgresDb();
    await db.execute(sql`select 1 as ok`);
    database = true;
    const result = await db.execute(sql`
      select count(*)::int as count
      from drizzle.__drizzle_migrations
    `);
    const count = Number((result.rows[0] as { count?: unknown } | undefined)?.count ?? 0);
    migrations = count === env.EXPECTED_MIGRATION_COUNT;
  } catch (error) {
    console.error(JSON.stringify({ component: "health-ready", errorClass: error instanceof Error ? error.name : "unknown" }));
  }

  const ready = database && migrations;
  return jsonOk(request, {
    ready,
    mode: env.APP_MODE,
    checks: { configuration: true, database, migrations },
    expectedMigrationCount: env.EXPECTED_MIGRATION_COUNT,
  }, ready ? 200 : 503);
}
