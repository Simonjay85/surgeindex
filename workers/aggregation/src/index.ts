export interface Env { INTERNAL_AGGREGATION_URL: string; INTERNAL_SERVICE_TOKEN: string; }

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(fetch(env.INTERNAL_AGGREGATION_URL, { method: "POST", headers: { Authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` } }).then(async (response) => {
      if (!response.ok) console.error(JSON.stringify({ component: "aggregation-worker", status: response.status }));
      else console.log(JSON.stringify({ component: "aggregation-worker", status: "completed" }));
    }).catch((error) => console.error(JSON.stringify({ component: "aggregation-worker", errorClass: error instanceof Error ? error.name : "unknown" }))));
  },
  async fetch() { return new Response("scheduled worker", { status: 200 }); },
};
