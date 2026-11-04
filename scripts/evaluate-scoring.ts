import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  DEFAULT_SCORING_CONFIG,
  computeHeatScore,
  evaluateBreakout,
  rankCandidates,
  type HeatScoreInput,
  type RankingCandidate,
} from "../packages/scoring/src/index.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");

function input(overrides: Partial<HeatScoreInput> = {}): HeatScoreInput {
  return {
    visitors24h: 10_000,
    baselineDailyVisitors: 8_000,
    activeNow: 400,
    typicalActiveNow: 250,
    engagementRate: 0.62,
    avgEngagementSeconds: 120,
    verification: "tracker",
    dataFreshnessSeconds: 60,
    fraudPenalty: 0,
    domainOwnershipVerified: true,
    visitors7d: 70_000,
    baselineSampleCount: 14,
    baselineConfidence: 0.9,
    dataCompleteness: 0.9,
    completedDataDays: 14,
    ...overrides,
  };
}

type EvaluationCase = {
  id: string;
  title: string;
  expected: string[];
  score?: HeatScoreInput;
  breakout?: { currentVisitors: number; baselineVisitors: number; activeNow: number | null; typicalActiveNow: number | null; freshness?: "live" | "fresh" | "delayed" | "stale" | "offline"; validTraffic?: boolean };
};

const cases: EvaluationCase[] = [
  { id: "A", title: "Tiny base spike", score: input({ visitors24h: 20, baselineDailyVisitors: 1, activeNow: 2, typicalActiveNow: 1, visitors7d: 20, completedDataDays: 3, baselineSampleCount: 3, baselineConfidence: 0.5, dataCompleteness: 0.5 }), expected: ["relative growth is visible", "absolute support is weak", "must not become global #1 automatically"] },
  { id: "B", title: "Large genuine surge", score: input({ visitors24h: 90_000, baselineDailyVisitors: 50_000, activeNow: 3_500, typicalActiveNow: 2_000, visitors7d: 630_000, engagementRate: 0.72, avgEngagementSeconds: 180 }), expected: ["strong volume and growth", "eligible global candidate", "breakout potential requires persistence"] },
  { id: "C", title: "Large stable site", score: input({ visitors24h: 103_000, baselineDailyVisitors: 100_000, activeNow: 1_000, typicalActiveNow: 1_000, visitors7d: 700_000 }), expected: ["strong volume", "weak growth velocity", "not a breakout from lift alone"] },
  { id: "D", title: "Low-volume stable site", score: input({ visitors24h: 100, baselineDailyVisitors: 100, activeNow: 5, typicalActiveNow: 5, visitors7d: 700, completedDataDays: 14 }), breakout: { currentVisitors: 100, baselineVisitors: 100, activeNow: 5, typicalActiveNow: 5 }, expected: ["low score relative to high-volume sites", "no breakout", "appropriate emerging league"] },
  { id: "E", title: "Bot spike", score: input({ visitors24h: 100_000, baselineDailyVisitors: 1_000, suspectedEvents24h: 350, acceptedEvents24h: 600, invalidEvents24h: 2_000, fraudReview: true }), breakout: { currentVisitors: 100_000, baselineVisitors: 1_000, activeNow: 3_000, typicalActiveNow: 30, validTraffic: false }, expected: ["fraud review", "no public breakout", "suspicious traffic is not a positive signal"] },
  { id: "F", title: "Stale tracker", score: input({ dataFreshnessSeconds: 100_000 }), expected: ["stale state", "score cap applies", "not in fresh global rank"] },
  { id: "G", title: "New legitimate site", score: input({ visitors24h: 500, baselineDailyVisitors: 400, visitors7d: 1_200, completedDataDays: 1, baselineSampleCount: 2, baselineConfidence: 0.3, dataCompleteness: 0.3 }), expected: ["building baseline", "new league", "not full-confidence global rank"] },
  { id: "H", title: "Missing engagement support", score: input({ engagementRate: null, avgEngagementSeconds: null }), expected: ["neutral engagement subscore", "explanation marks unavailable metric", "confidence adjustment"] },
  { id: "I", title: "Nearly tied sites", expected: ["stable deterministic ordering", "domain and site ID tie-breakers"] },
  { id: "J", title: "Sudden live acceleration", score: input({ activeNow: 2_000, typicalActiveNow: 300 }), breakout: { currentVisitors: 5_000, baselineVisitors: 1_000, activeNow: 2_000, typicalActiveNow: 300 }, expected: ["strong live component", "watch before public breakout", "persistence required"] },
  { id: "K", title: "One-minute anomaly", breakout: { currentVisitors: 400, baselineVisitors: 100, activeNow: 20, typicalActiveNow: 10 }, expected: ["watch only on first window", "no public breakout from one evaluation"] },
  { id: "L", title: "Recovery after data outage", score: input({ dataFreshnessSeconds: 100_000 }), expected: ["stale during outage", "freshness recovers when valid data resumes", "historical records remain"] },
];

function scoreResult(testCase: EvaluationCase) {
  if (!testCase.score) return null;
  const result = computeHeatScore(testCase.score);
  return { score: result.displayedScore, rawScore: result.rawScore, smoothedScore: result.smoothedScore, state: result.state, freshness: result.freshness, league: result.league, confidence: result.confidence, breakdown: result.breakdown, notes: result.notes, reasonCodes: result.reasonCodes, relativeLift: result.relativeLift, absoluteLift: result.absoluteLift, recovery: testCase.id === "L" ? (() => { const recovered = computeHeatScore({ ...testCase.score!, dataFreshnessSeconds: 60 }); return { state: recovered.state, freshness: recovered.freshness, score: recovered.displayedScore }; })() : null };
}

function breakoutResult(testCase: EvaluationCase) {
  if (!testCase.breakout) return null;
  const value = testCase.breakout;
  const watch = evaluateBreakout({ ...value, dataConfidence: 0.9, freshness: value.freshness ?? "fresh", suspicionRatio: 0, validTraffic: value.validTraffic ?? true }, null, NOW);
  const persisted = watch.activeSince ? { state: watch.state, activeSince: watch.activeSince, lastEvaluatedAt: NOW, cooldownUntil: null } : null;
  const afterPersistence = persisted && testCase.id !== "K" ? evaluateBreakout({ ...value, dataConfidence: 0.9, freshness: value.freshness ?? "fresh", suspicionRatio: 0, validTraffic: value.validTraffic ?? true }, persisted, new Date(NOW.getTime() + DEFAULT_SCORING_CONFIG.breakout.persistenceMinutes * 60_000)) : null;
  return { firstWindow: { state: watch.state, shouldPublish: watch.shouldPublish, relativeLift: watch.relativeLift, absoluteLift: watch.absoluteLift, explanation: watch.explanation }, afterPersistence: afterPersistence ? { state: afterPersistence.state, shouldPublish: afterPersistence.shouldPublish, relativeLift: afterPersistence.relativeLift, absoluteLift: afterPersistence.absoluteLift, explanation: afterPersistence.explanation } : null };
}

function rankingFixture(size: number): RankingCandidate[] {
  return Array.from({ length: size }, (_, index) => ({
    siteId: `perf-${index.toString().padStart(5, "0")}`,
    domain: `site-${index.toString().padStart(5, "0")}.example`,
    categorySlug: index % 4 === 0 ? "tools" : "media",
    state: "eligible" as const,
    league: index % 3 === 0 ? "established" as const : "emerging" as const,
    displayedScore: (index * 37) % 101,
    smoothedScore: ((index * 37) % 101) - 0.25,
    dataConfidence: 0.7 + (index % 30) / 100,
    visitors24h: 1_000 + index,
    calculatedAt: NOW,
    freshness: "fresh" as const,
    breakoutState: index % 37 === 0 ? "breaking_out" : "none",
  }));
}

function performanceTest(size: number) {
  const scoreInputs = Array.from({ length: size }, (_, index) => input({ visitors24h: 1_000 + index * 37, baselineDailyVisitors: 800 + index * 23, visitors7d: 7_000 + index * 200 }));
  const rankingCandidates = rankingFixture(size);
  const scoreStart = performance.now();
  for (const scoreInput of scoreInputs) computeHeatScore(scoreInput);
  const scoreMs = performance.now() - scoreStart;
  const rankStart = performance.now();
  rankCandidates(rankingCandidates, "global");
  const rankMs = performance.now() - rankStart;
  const breakoutStart = performance.now();
  for (let index = 0; index < size; index += 1) evaluateBreakout({ currentVisitors: 1_500 + index, baselineVisitors: 1_000, activeNow: 120, typicalActiveNow: 80, dataConfidence: 0.8, freshness: "fresh", suspicionRatio: 0, validTraffic: true }, null, NOW);
  const breakoutMs = performance.now() - breakoutStart;
  return { size, scoreMs: Number(scoreMs.toFixed(3)), rankMs: Number(rankMs.toFixed(3)), breakoutMs: Number(breakoutMs.toFixed(3)), environment: `${process.platform} ${process.arch}, Node ${process.version}` };
}

const results = cases.map((testCase) => ({ id: testCase.id, title: testCase.title, expected: testCase.expected, score: scoreResult(testCase), breakout: breakoutResult(testCase) }));
const performanceResults = [100, 1_000].map(performanceTest);
const rankingProbe = rankCandidates([
  { ...rankingFixture(1)[0], siteId: "tie-b", domain: "b.example", displayedScore: 80, smoothedScore: 80 },
  { ...rankingFixture(1)[0], siteId: "tie-a", domain: "a.example", displayedScore: 80, smoothedScore: 80 },
], "global").map((candidate) => candidate.siteId);
const report = { scoreVersion: DEFAULT_SCORING_CONFIG.version, generatedAt: new Date().toISOString(), syntheticFixture: true, cases: results, rankingProbe, performance: performanceResults, limitations: ["Synthetic fixtures test determinism and fairness invariants; they are not predictive validation.", "Performance timings are local process timings without PostgreSQL, Cloudflare, or Tinybird."] };

const markdown = [
  `# SurgeIndex scoring evaluation`,
  ``,
  `- Score version: ${report.scoreVersion}`,
  `- Generated at: ${report.generatedAt}`,
  `- Fixture: deterministic synthetic cases A–L`,
  ``,
  `## Cases`,
  ``,
  `| Case | State | League | Score | Freshness | Breakout first → persistent |`,
  `| --- | --- | --- | ---: | --- | --- |`,
  ...results.map((item) => `| ${item.id} · ${item.title} | ${item.score?.state ?? "n/a"} | ${item.score?.league ?? "n/a"} | ${item.score?.score ?? "n/a"} | ${item.score?.freshness ?? "n/a"} | ${item.breakout ? `${item.breakout.firstWindow.state} → ${item.breakout.afterPersistence?.state ?? "n/a"}` : "n/a"} |`),
  ``,
  `## Deterministic tie probe`,
  ``,
  `Ordering: ${rankingProbe.join(" → ")}.`,
  ``,
  `## Local performance timings`,
  ``,
  `| Sites | score loop (ms) | rank sort (ms) | breakout loop (ms) | environment |`,
  `| ---: | ---: | ---: | ---: | --- |`,
  ...performanceResults.map((item) => `| ${item.size} | ${item.scoreMs} | ${item.rankMs} | ${item.breakoutMs} | ${item.environment} |`),
  ``,
  `## Limitations`,
  ``,
  ...report.limitations.map((item) => `- ${item}`),
  ``,
].join("\n");

mkdirSync("output", { recursive: true });
writeFileSync("output/scoring-evaluation.json", `${JSON.stringify(report, null, 2)}\n`);
writeFileSync("output/scoring-evaluation.md", markdown);
console.log(markdown);
