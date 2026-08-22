/** Formatting helpers shared by server and client. All pure + deterministic. */

/** 942 -> "942", 78_213 -> "78.2K", 2_100_000 -> "2.1M" */
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${trimZero(v.toFixed(v >= 100 ? 0 : 1))}M`;
  }
  if (abs >= 1_000) {
    const v = n / 1_000;
    return `${trimZero(v.toFixed(v >= 100 ? 0 : 1))}K`;
  }
  return String(Math.round(n));
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** 218 -> "+218%", -12.4 -> "-12.4%", null -> "—" */
export function formatPct(n: number | null | undefined, signed = true): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const v = Math.round(n * 10) / 10;
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${trimZero(v.toFixed(1))}%`;
}

/** Movement for rank arrows: +3 means moved up 3 positions. */
export function formatMovement(movement: number): string {
  if (movement > 0) return `↑${movement}`;
  if (movement < 0) return `↓${Math.abs(movement)}`;
  return "—";
}

/** "3 minutes ago", "just now", "2 days ago". */
export function timeAgo(iso: string | Date, now: Date = new Date()): string {
  const then = typeof iso === "string" ? new Date(iso) : iso;
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months <= 1) return "1 month ago";
  return `${months} months ago`;
}

/** Data freshness in human terms. */
export function formatFreshness(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "unknown";
  if (seconds < 90) return "live";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

/** 4.2 -> "4.2×" */
export function formatMultiple(n: number): string {
  return `${trimZero(n.toFixed(1))}×`;
}

/** 1234567 -> "1,234,567" */
export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}
