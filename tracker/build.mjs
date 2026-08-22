import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";

mkdirSync(new URL("./build", import.meta.url).pathname, { recursive: true });

await build({
  entryPoints: ["src/tracker-entry.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2018"],
  outfile: "build/tracker.js",
  legalComments: "none",
  metafile: true,
}).then((result) => {
  const out = Object.entries(result.metafile.outputs).find(([k]) => k.endsWith("tracker.js"));
  if (out) {
    const bytes = readFileSync("build/tracker.js");
    console.log(`tracker.js: ${(bytes.length / 1024).toFixed(2)} KB minified, ${(gzipSync(bytes).length / 1024).toFixed(2)} KB gzip, ${(brotliCompressSync(bytes).length / 1024).toFixed(2)} KB brotli`);
  }
});

// Also copy into the web app's public folder so /tracker.js is served in dev.
import { copyFileSync } from "node:fs";
try {
  copyFileSync("build/tracker.js", "../apps/web/public/tracker.js");
  console.log("copied to apps/web/public/tracker.js");
} catch {
  console.warn("apps/web/public not available yet — run again after scaffolding");
}
