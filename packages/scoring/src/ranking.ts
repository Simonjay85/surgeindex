import type { FreshnessState, RankingState, ScoringLeague } from "./config";

export type RankingScope =
  | "global"
  | "new"
  | "breakout"
  | `global:${ScoringLeague}`
  | `category:${string}`
  | `category:${string}:${ScoringLeague}`;

export interface RankingCandidate {
  siteId: string;
  domain: string;
  categorySlug?: string | null;
  state: RankingState;
  league: ScoringLeague;
  displayedScore: number;
  smoothedScore: number;
  dataConfidence: number;
  visitors24h: number | null;
  calculatedAt: Date | string;
  freshness?: FreshnessState;
  breakoutState?: string;
}

export function compareRankingCandidates(a: RankingCandidate, b: RankingCandidate): number {
  if (b.displayedScore !== a.displayedScore) return b.displayedScore - a.displayedScore;
  if (b.smoothedScore !== a.smoothedScore) return b.smoothedScore - a.smoothedScore;
  if (b.dataConfidence !== a.dataConfidence) return b.dataConfidence - a.dataConfidence;
  const av = a.visitors24h ?? -1;
  const bv = b.visitors24h ?? -1;
  if (bv !== av) return bv - av;
  const at = new Date(a.calculatedAt).getTime();
  const bt = new Date(b.calculatedAt).getTime();
  if (at !== bt) return at - bt;
  if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
  return a.siteId.localeCompare(b.siteId);
}

export function candidateBelongsToScope(candidate: RankingCandidate, scope: RankingScope): boolean {
  if (["suspended", "fraud_review", "ineligible"].includes(candidate.state)) return false;
  if (["unverified", "stale"].includes(candidate.state) && scope !== "new") return false;
  if (scope === "global") return candidate.state === "eligible";
  if (scope === "new") return ["building_baseline", "provisional"].includes(candidate.state) || candidate.league === "new";
  if (scope === "breakout") return candidate.state === "eligible" && ["watch", "breaking_out", "surging", "cooling"].includes(candidate.breakoutState ?? "");
  if (scope.startsWith("global:")) return candidate.league === scope.slice("global:".length) && ["eligible", "provisional"].includes(candidate.state);
  if (scope.startsWith("category:")) {
    const parts = scope.split(":");
    if (candidate.categorySlug !== parts[1]) return false;
    return parts.length === 2 ? ["eligible", "provisional"].includes(candidate.state) : candidate.league === parts[2] && ["eligible", "provisional"].includes(candidate.state);
  }
  return false;
}

export function rankCandidates(candidates: RankingCandidate[], scope: RankingScope): RankingCandidate[] {
  return candidates.filter((candidate) => candidateBelongsToScope(candidate, scope)).sort(compareRankingCandidates);
}

export function rankMovement(currentRank: number, previousRank: number | null): number | null {
  return previousRank == null ? null : previousRank - currentRank;
}
