import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const patterns = [
  /sk_live_[A-Za-z0-9]{12,}/,
  /whsec_[A-Za-z0-9]{16,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}(?:[^A-Za-z0-9]|$)/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[0-9A-Za-z-]{20,}/,
  /postgres(?:ql)?:\/\/[^\s/:@]+:[^\s@]+@/i,
];
const findings = [];
for (const file of tracked) {
  if (file.endsWith(".lockb") || file.endsWith("pnpm-lock.yaml") || file.endsWith(".env.example") || file.endsWith(".env.production.example")) continue;
  const content = await readFile(file, "utf8").catch(() => "");
  for (const pattern of patterns) {
    if (pattern.test(content)) findings.push(`${file}: ${pattern}`);
  }
}
if (findings.length) {
  console.error("FAIL secret-scan");
  for (const finding of findings) console.error(finding);
  process.exit(1);
}
console.log(`PASS secret-scan: ${tracked.length} tracked files checked; no high-risk credential patterns found.`);
