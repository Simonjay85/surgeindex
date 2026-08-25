import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const migrationDir = join(process.cwd(), "packages/db/drizzle");
const expectedMigrationCount = Number(process.env.EXPECTED_MIGRATION_COUNT ?? 14);
const evidenceFile = process.env.MIGRATION_EVIDENCE_FILE;

type MigrationEvidence = {
  schemaVersion: 1;
  result: "PASS" | "FAIL";
  generatedAt: string;
  workflowRunStartedAt: string | null;
  commitSha: string;
  expectedMigrationCount: number;
  target: {
    databaseName: string | null;
    host: string | null;
    port: string | null;
    disposableGuard: "PASS" | "FAIL" | "PENDING";
  };
  postgres: {
    version: string | null;
    serverAddress: string | null;
    serverPort: number | null;
  };
  fresh: {
    result: "PASS" | "FAIL" | "PENDING";
    migrationCount: number | null;
    path: string;
  };
  batch6Upgrade: {
    result: "PASS" | "FAIL" | "PENDING";
    baselineMigrationCount: number | null;
    finalMigrationCount: number | null;
    path: string;
  };
  failure?: {
    errorType: string;
    message: string;
  };
};

function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function redact(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s)'"`]+/gi, "postgresql://[REDACTED]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(password|secret|token|api[_-]?key|private[_-]?key|authorization)(\s*[=:]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b/g, "stripe_[REDACTED]")
    .replace(/\bwhsec_[A-Za-z0-9]+\b/g, "webhook_[REDACTED]");
}

function safeError(error: unknown): { errorType: string; message: string } {
  const message = error instanceof Error ? error.message : "Migration smoke failed.";
  return { errorType: error instanceof Error ? error.name : "UnknownError", message: redact(message).slice(0, 500) };
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function looksProductionLike(value: string): boolean {
  return /(?:^|[-_.])(prod(?:uction)?|live|primary|main)(?:$|[-_.])/i.test(value);
}

function parseDisposableTarget(connectionString: string): { databaseName: string; host: string; port: string | null } {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("RELEASE_DB_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("RELEASE_DB_URL must use the postgres or postgresql scheme.");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const namedDatabase = process.env.RELEASE_DB_SMOKE_DATABASE_NAME?.trim() ?? "";
  if (!databaseName || !namedDatabase || databaseName !== namedDatabase) throw new Error("Name the disposable database with RELEASE_DB_SMOKE_DATABASE_NAME; refusing an unscoped schema reset.");
  if (looksProductionLike(databaseName) || looksProductionLike(host) || looksProductionLike(decodeURIComponent(url.username))) throw new Error("Refusing to reset a production/live-looking database target.");
  if (!isLoopbackHost(host)) throw new Error("Migration smoke only permits a loopback PostgreSQL host; refusing a remote database reset.");
  return { databaseName, host, port: url.port || null };
}

async function writeEvidence(evidence: MigrationEvidence): Promise<void> {
  if (!evidenceFile) return;
  await mkdir(dirname(evidenceFile), { recursive: true });
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

async function serverInfo(pool: Pool): Promise<{ databaseName: string; version: string; serverAddress: string | null; serverPort: number | null }> {
  const result = await pool.query<{ database_name: string; version: string; server_address: string | null; server_port: number | null }>(
    "select current_database() as database_name, version() as version, inet_server_addr()::text as server_address, inet_server_port() as server_port",
  );
  const row = result.rows[0];
  if (!row) throw new Error("PostgreSQL returned no server identity.");
  return row;
}

async function resetSchema(connectionString: string, expectedDatabaseName: string): Promise<void> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, query_timeout: 10_000 });
  await client.connect();
  try {
    const identity = await client.query<{ database_name: string; server_address: string | null }>(
      "select current_database() as database_name, inet_server_addr()::text as server_address",
    );
    const row = identity.rows[0];
    if (!row || row.database_name !== expectedDatabaseName) throw new Error("Connected database did not match the explicitly named disposable target.");
    if (row.server_address && !isLoopbackHost(row.server_address)) throw new Error("Connected PostgreSQL server was not loopback-only; refusing schema reset.");
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
  } finally {
    await client.end();
  }
}

async function appliedCount(pool: Pool): Promise<number> {
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

async function main(): Promise<void> {
  const evidence: MigrationEvidence = {
    schemaVersion: 1,
    result: "FAIL",
    generatedAt: new Date().toISOString(),
    workflowRunStartedAt: process.env.WORKFLOW_RUN_STARTED_AT ?? process.env.GITHUB_RUN_STARTED_AT ?? null,
    commitSha: commitSha(),
    expectedMigrationCount,
    target: { databaseName: null, host: null, port: null, disposableGuard: "PENDING" },
    postgres: { version: null, serverAddress: null, serverPort: null },
    fresh: { result: "PENDING", migrationCount: null, path: "0000 -> 0013" },
    batch6Upgrade: { result: "PENDING", baselineMigrationCount: null, finalMigrationCount: null, path: "0000 -> 0010; 0011 -> 0012 -> 0013" },
  };

  let pool: Pool | null = null;
  let subset: string | null = null;
  try {
    const connectionString = process.env.RELEASE_DB_URL ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Set RELEASE_DB_URL (or DATABASE_URL) to a disposable PostgreSQL database.");
    if (process.env.RELEASE_DB_SMOKE_ALLOW_SCHEMA_RESET !== "true") throw new Error("Migration smoke requires RELEASE_DB_SMOKE_ALLOW_SCHEMA_RESET=true.");
    if (process.env.RELEASE_DB_SMOKE_DISPOSABLE !== "YES") throw new Error("Migration smoke requires RELEASE_DB_SMOKE_DISPOSABLE=YES; production databases must never be reset.");
    const target = parseDisposableTarget(connectionString);
    evidence.target = { databaseName: target.databaseName, host: target.host, port: target.port, disposableGuard: "PASS" };

    pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000, query_timeout: 10_000, idleTimeoutMillis: 1_000 });
    const info = await serverInfo(pool);
    if (info.databaseName !== target.databaseName) throw new Error("PostgreSQL current_database() did not match the disposable target.");
    if (info.serverAddress && !isLoopbackHost(info.serverAddress)) throw new Error("PostgreSQL reported a non-loopback server address; refusing schema reset.");
    evidence.postgres = { version: info.version, serverAddress: info.serverAddress, serverPort: info.serverPort };

    await resetSchema(connectionString, target.databaseName);
    await migrate(drizzle(pool), { migrationsFolder: migrationDir });
    const freshCount = await appliedCount(pool);
    evidence.fresh.migrationCount = freshCount;
    if (freshCount !== expectedMigrationCount) throw new Error(`Fresh migration expected ${expectedMigrationCount} rows, found ${freshCount}.`);
    evidence.fresh.result = "PASS";
    console.log(`PASS migration fresh: ${freshCount} journal entries applied.`);

    await resetSchema(connectionString, target.databaseName);
    subset = await migrationSubset();
    await migrate(drizzle(pool), { migrationsFolder: subset });
    const oldCount = await appliedCount(pool);
    evidence.batch6Upgrade.baselineMigrationCount = oldCount;
    if (oldCount !== 11) throw new Error(`Batch 6 baseline migration expected 11 rows, found ${oldCount}.`);
    console.log(`PASS migration upgrade baseline: ${oldCount} journal entries applied before 0011/0012/0013.`);
    await migrate(drizzle(pool), { migrationsFolder: migrationDir });
    const finalCount = await appliedCount(pool);
    evidence.batch6Upgrade.finalMigrationCount = finalCount;
    if (finalCount !== expectedMigrationCount) throw new Error(`Batch 6 upgrade expected ${expectedMigrationCount} rows, found ${finalCount}.`);
    evidence.batch6Upgrade.result = "PASS";
    console.log(`PASS migration upgrade: ${finalCount} migrations applied through ${migrationDir}.`);
    evidence.result = "PASS";
  } catch (error) {
    evidence.failure = safeError(error);
    if (evidence.target.disposableGuard === "PENDING") evidence.target.disposableGuard = "FAIL";
    console.error(evidence.failure.message);
    process.exitCode = 1;
  } finally {
    if (subset) await rm(subset, { recursive: true, force: true });
    if (pool) await pool.end();
    await writeEvidence(evidence);
  }
}

void main().catch(async (error: unknown) => {
  const fallback: MigrationEvidence = {
    schemaVersion: 1,
    result: "FAIL",
    generatedAt: new Date().toISOString(),
    workflowRunStartedAt: process.env.WORKFLOW_RUN_STARTED_AT ?? process.env.GITHUB_RUN_STARTED_AT ?? null,
    commitSha: commitSha(),
    expectedMigrationCount,
    target: { databaseName: null, host: null, port: null, disposableGuard: "FAIL" },
    postgres: { version: null, serverAddress: null, serverPort: null },
    fresh: { result: "PENDING", migrationCount: null, path: "0000 -> 0013" },
    batch6Upgrade: { result: "PENDING", baselineMigrationCount: null, finalMigrationCount: null, path: "0000 -> 0010; 0011 -> 0012 -> 0013" },
    failure: safeError(error),
  };
  await writeEvidence(fallback);
  console.error(fallback.failure?.message ?? "Migration smoke failed.");
  process.exitCode = 1;
});
