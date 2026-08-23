import { runAllScoringJobs } from "../apps/web/lib/server/ranking-engine";

const result = await runAllScoringJobs();
console.log(JSON.stringify(result, null, 2));
