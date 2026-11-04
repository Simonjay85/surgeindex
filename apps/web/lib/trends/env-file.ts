import { readFileSync } from "node:fs";

/**
 * Minimal dotenv reader for the ingest cron. Does not depend on
 * `process.loadEnvFile` (Node >= 20.12) so it works on every supported Node,
 * and never overwrites a variable that is already set to a non-empty value.
 * Returns the names it set (never values) so callers can log safely.
 */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const quoted = value.match(/^"(.*)"$/) ?? value.match(/^'(.*)'$/);
    if (quoted) value = quoted[1]!;
    out[key] = value;
  }
  return out;
}

export interface EnvFileResult {
  ok: boolean;
  set: string[];
  error?: string;
}

export function loadEnvFileInto(file: string, env: Record<string, string | undefined> = process.env): EnvFileResult {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    return { ok: false, set: [], error: (e as NodeJS.ErrnoException).code ?? (e as Error).message };
  }
  const set: string[] = [];
  for (const [key, value] of Object.entries(parseEnvFile(text))) {
    if (env[key]?.trim()) continue;
    if (!value) continue;
    env[key] = value;
    set.push(key);
  }
  return { ok: true, set };
}
