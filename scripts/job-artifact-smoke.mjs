import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = join(process.cwd(), "dist/jobs");
const artifacts = (await readdir(directory)).filter((file) => file.endsWith(".mjs")).sort();
if (artifacts.length !== 13) throw new Error(`Expected 13 bundled job artifacts, found ${artifacts.length}.`);

for (const artifact of artifacts) {
  const result = spawnSync(process.execPath, [join(directory, artifact)], {
    env: {
      ...process.env,
      APP_MODE: "demo",
      DATA_PROVIDER: "demo",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      BOOST_ENABLED: "false",
      GA4_ENABLED: "false",
      STRIPE_ENABLED: "false",
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    throw new Error(`Job artifact smoke failed for ${artifact}.`);
  }
}

console.log(`PASS job artifact smoke: ${artifacts.length} bundled entrypoints start in disabled demo mode.`);
