import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Minimal .env loader for CLI tools (drizzle-kit, seed scripts). Next.js loads
 * apps/web/.env itself; this makes DATABASE_URL available outside Next.
 */
const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, "../../../apps/web/.env"),
  resolve(here, "../../.env"),
];

for (const path of candidates) {
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
    break;
  } catch {
    // try next candidate
  }
}
