"use client";

import { useSyncExternalStore } from "react";
import { effectiveBoardStatus, type FreshnessBoard } from "../../lib/trends/freshness";

const listeners = new Set<() => void>();
let timer: number | undefined;
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (timer === undefined) timer = window.setInterval(() => listeners.forEach((listener) => listener()), 20_000);
  return () => {
    listeners.delete(onChange);
    if (!listeners.size && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}
const nowSnapshot = () => Math.floor(Date.now() / 20_000) * 20_000;
const serverSnapshot = () => null;

function utcDateTime(iso: string) {
  const time = new Date(iso);
  return Number.isFinite(time.getTime()) ? `${time.toISOString().slice(0, 16).replace("T", " ")} UTC` : null;
}

export function BoardFreshness({ board, showTime = true, archive = false, compact = false }: { board: FreshnessBoard; showTime?: boolean; archive?: boolean; compact?: boolean }) {
  const now = useSyncExternalStore(subscribe, nowSnapshot, serverSnapshot);
  const status = effectiveBoardStatus(board, archive ? null : now);
  const timestamp = board.fetchedAt ? utcDateTime(board.fetchedAt) : null;
  const label = status === "live" ? "Live" : status === "stale" ? "Delayed" : status === "soon" ? "Coming soon" : "Unavailable";
  const css = status === "unavailable" ? "down" : status;
  return (
    <span className="t-freshness">
      <span className={`t-status is-${css}`} title={board.note}>{archive ? `At capture: ${label}` : label}</span>
      {showTime && timestamp ? <span className="t-freshness-time">{compact ? <span className="sr-only">Last successful: </span> : "Last successful: "}<time dateTime={board.fetchedAt!}>{timestamp}</time></span> : null}
    </span>
  );
}

export function LiveSourceCount({ boards }: { boards: FreshnessBoard[] }) {
  const now = useSyncExternalStore(subscribe, nowSnapshot, serverSnapshot);
  return <>{boards.filter((board) => effectiveBoardStatus(board, now) === "live").length}</>;
}
