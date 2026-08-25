import "server-only";

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { closeDb, getPostgresDb, systemJobRun } from "@surge/db";
import { getServerEnv } from "@surge/config";

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && error.name && /^[A-Za-z0-9_.-]{1,80}$/.test(error.name)) return error.name;
  return "job_failed";
}

/** Persist short-lived job liveness without persisting provider payloads. */
export async function withJobStatus<T>(jobKey: string, fn: (requestId: string) => Promise<T>, suppliedRequestId = randomUUID()): Promise<T> {
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres") return fn(suppliedRequestId);
  const db = getPostgresDb();
  const startedAt = new Date();
  await db.insert(systemJobRun).values({ jobKey, lastStartedAt: startedAt, lastRequestId: suppliedRequestId, updatedAt: startedAt }).onConflictDoUpdate({
    target: systemJobRun.jobKey,
    set: { lastStartedAt: startedAt, lastRequestId: suppliedRequestId, updatedAt: startedAt },
  });
  try {
    const result = await fn(suppliedRequestId);
    const finishedAt = new Date();
    await db.update(systemJobRun).set({ lastSuccessAt: finishedAt, lastErrorCode: null, consecutiveFailures: 0, updatedAt: finishedAt }).where(sql`${systemJobRun.jobKey} = ${jobKey}`);
    console.log(JSON.stringify({ component: "system-job", jobKey, status: "completed", requestId: suppliedRequestId, finishedAt: finishedAt.toISOString() }));
    return result;
  } catch (error) {
    const failedAt = new Date();
    const errorCode = safeErrorCode(error);
    await db.update(systemJobRun).set({ lastFailureAt: failedAt, lastErrorCode: errorCode, consecutiveFailures: sql`${systemJobRun.consecutiveFailures} + 1`, updatedAt: failedAt }).where(sql`${systemJobRun.jobKey} = ${jobKey}`);
    console.error(JSON.stringify({ component: "system-job", jobKey, status: "failed", requestId: suppliedRequestId, errorCode, failedAt: failedAt.toISOString() }));
    throw error;
  } finally {
    await closeDb();
  }
}
