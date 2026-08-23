import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep the first deployment compatible with the current Wrangler config.
// R2 incremental caching can be enabled once a real R2 bucket is provisioned.
export default defineCloudflareConfig({});
