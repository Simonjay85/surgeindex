import { autoInit } from "./tracker.js";

// Same-origin collect route. For the dedicated Cloudflare collector worker,
// rebuild with: TRACKER_ENDPOINT=https://collect.example.com/v1/events
const ENDPOINT = "/api/collect/v1/events";

autoInit(ENDPOINT);
