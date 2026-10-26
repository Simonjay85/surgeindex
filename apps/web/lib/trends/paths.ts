import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Where trend snapshots live. TRENDS_DATA_DIR wins (use an absolute path on
 * servers so data survives release directories). Otherwise default to
 * apps/web/data/trends, resolved from either the repo root (ingest script)
 * or apps/web (Next.js server).
 */
export function resolveTrendsDataDir(): string {
  const configured = process.env.TRENDS_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  return bundledTrendsDataDir();
}

/** The snapshot directory committed with the repository (seed data). */
export function bundledTrendsDataDir(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "apps", "web", "package.json"))) return path.join(cwd, "apps", "web", "data", "trends");
  return path.join(cwd, "data", "trends");
}

export const LATEST_FILE = "latest.json";
export const HISTORY_DIR = "history";
export const DAILY_DIR = "daily";
