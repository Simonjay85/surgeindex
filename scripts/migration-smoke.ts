import { mkdtemp, readFile, readdir, rm, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const migrationDir = join(process.cwd(), "packages/db/drizzle");
const connectionString = process.env.RELEASE_DB_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set RELEASE_DB_URL (or DATABASE_URL) to a disposable PostgreSQL database.");
if (process.env.RELEASE_DB_SMOKE_ALLOW_SCHEMA_RESET !== "true") throw new Error("Migration smoke requires RELEASE_DB_SMOKE_ALLOW_SCHEMA_RESET=true.");
const databaseUrl = new URL(connectionString);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
if (!databaseName || !process.env.RELEASE_DB_SMOKE_DATABASE_NAME || process.env.RELEASE_DB_SMOKE_DATABASE_NAME !== databaseName) throw new Error("Name the disposable database with RELEASE_DB_SMOKE_DATABASE_NAME; refusing an unscoped schema reset.");
if (/(?:prod|production|live)/i.test(databaseName)) throw new Error("Refusing to reset a production/live-named database.");

async function resetSchema() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
  } finally {
    await client.end();
  }
}

async function appliedCount(pool: Pool) {
  const result = await pool.query<{ count: string }>("select count(*)::text as count from __drizzle_migrations");
  return Number(result.rows[0]?.count ?? 0);
}

async function migrationSubset(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "surgeindex-migrations-"));
  await cp(migrationDir, target, { recursive: true });
  const entries = JSON.parse(await readFile(join(target, "meta/_journal.json"), "utf8")) as { entries: unknown[] };
  entries.entries = entries.entries.slice(0, 11);
  await writeFile(join(target, "meta/_journal.json"), `${JSON.stringify(entries, null, 2)}\n`);
  const files = await readdir(target);
  await Promise.all(files.filter((file) => /^\d{4}_/.test(file) && Number(file.slice(0, 4)) > 10 && file.endsWith(".sql")).map((file) => rm(join(target, file))));
  await Promise.all((await readdir(join(target, "meta"))).filter((file) => /^\d{4}_snapshot\.json$/.test(file) && Number(file.slice(0, 4)) > 10).map((file) => rm(join(target, "meta", file))));
  return target;
}

async function main() {
  const pool = new Pool({ connectionString });
  let subset: string | null = null;
  try {
    await resetSchema();
    await migrate(drizzle(pool), { migrationsFolder: migrationDir });
    const freshCount = await appliedCount(pool);
    const expected = Number(process.env.EXPECTED_MIGRATION_COUNT ?? 14);
    if (freshCount !== expected) throw new Error(`Fresh migration expected ${expected} rows, found ${freshCount}.`);
    console.log(`PASS migration fresh: ${freshCount} journal entries applied.`);

    await resetSchema();
    subset = await migrationSubset();
    await migrate(drizzle(pool), { migrationsFolder: subset });
    const oldCount = await appliedCount(pool);
    if (oldCount !== 11) throw new Error(`Fresh baseline migration expected 11 rows, found ${oldCount}.`);
    console.log(`PASS migration upgrade baseline: ${oldCount} journal entries applied before 0011/0012.`);
    await migrate(drizzle(pool), { migrationsFolder: migrationDir });
    const finalCount = await appliedCount(pool);
    if (finalCount !== expected) throw new Error(`Full migration expected ${expected} rows, found ${finalCount}.`);
    console.log(`PASS migration upgrade: ${finalCount} migrations applied through ${migrationDir}.`);
  } finally {
    if (subset) await rm(subset, { recursive: true, force: true });
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration smoke failed.");
  process.exitCode = 1;
});
