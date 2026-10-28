export function retryableGoogleStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export function exponentialBackoffMs(attempt: number, random = Math.random): number {
  const boundedAttempt = Math.max(0, Math.min(attempt, 8));
  const base = Math.min(30_000, 250 * 2 ** boundedAttempt);
  const jitter = 0.8 + random() * 0.4;
  return Math.round(base * jitter);
}
