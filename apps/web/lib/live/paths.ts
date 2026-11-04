import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Runtime data that must survive deploys lives next to the trends data dir
 * (on the VPS: /opt/surgeindex/shared/{trends,live,tips}). Explicit env vars
 * win; locally everything falls back to apps/web/data/<name> (git-ignored).
 */
function sharedDir(name: string, override: string | undefined): string {
  const explicit = override?.trim();
  if (explicit) return path.resolve(explicit);
  const trends = process.env.TRENDS_DATA_DIR?.trim();
  if (trends) return path.join(path.dirname(path.resolve(trends)), name);
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "apps", "web", "package.json"))) return path.join(cwd, "apps", "web", "data", name);
  return path.join(cwd, "data", name);
}

export function resolveLiveDataDir(): string {
  return sharedDir("live", process.env.LIVE_DATA_DIR);
}

export function resolveTipsDataDir(): string {
  return sharedDir("tips", process.env.TIPS_DATA_DIR);
}
