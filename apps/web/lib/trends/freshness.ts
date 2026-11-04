import type { TrendBoard } from "./types";

/** A missed hourly run can occur during collection; after three hours, stop calling it live. */
export const FRESHNESS_LIMIT_MS = 3 * 60 * 60 * 1000;
export type FreshnessBoard = Pick<TrendBoard, "status" | "fetchedAt"> & Partial<Pick<TrendBoard, "note">>;

export function effectiveBoardStatus(board: FreshnessBoard, now: number | null): TrendBoard["status"] {
  if (board.status !== "live") return board.status;
  const fetched = board.fetchedAt ? Date.parse(board.fetchedAt) : NaN;
  if (!Number.isFinite(fetched)) return "unavailable";
  if (now !== null && now - fetched > FRESHNESS_LIMIT_MS) return "stale";
  return "live";
}
