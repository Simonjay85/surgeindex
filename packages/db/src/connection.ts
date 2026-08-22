import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type SurgeDatabase = NodePgDatabase<typeof schema> | ReturnType<typeof drizzleNeon>;

let instance: SurgeDatabase | null = null;
let pool: Pool | null = null;

/**
 * Database singleton. Driver is switchable so the same code runs on Node
 * (pg over TCP, local/docker Postgres) and Cloudflare Workers (Neon HTTP).
 */
export function getDb(): SurgeDatabase {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const driver = process.env.DB_DRIVER ?? "pg";
  if (driver === "neon") {
    const client = neon(url);
    instance = drizzleNeon(client, { schema }) as SurgeDatabase;
  } else {
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    instance = drizzle(pool, { schema });
  }
  return instance;
}

/** Call on process exit in long-lived scripts. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  instance = null;
}

export { schema };
