import { z } from "zod";

/**
 * Live blog ("Cập nhật trực tiếp") runtime data. Stored per story in
 * <LIVE_DATA_DIR>/<slug>.json (updates, appended through the token-protected
 * API, never rewritten) and <slug>.press.json (news matches written by the
 * hourly ingest). Both are read at request time, so no rebuild is needed.
 */

const httpsUrl = z.url({ protocol: /^https$/ }).max(2048);
/** ISO date-time with an explicit offset, e.g. 2026-10-27T09:15:00+07:00. */
export const offsetDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/, "expected ISO date-time with offset, e.g. 2026-10-27T09:15:00+07:00");

export const liveSourceSchema = z.object({
  url: httpsUrl,
  title: z.string().trim().min(1).max(300).optional(),
  publisher: z.string().trim().min(1).max(100).optional(),
});

export const liveUpdateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  time: offsetDateTime,
  text: z.string().trim().min(1).max(800),
  sources: z.array(liveSourceSchema).min(1, "every update needs at least one source URL"),
  posted_at: offsetDateTime,
});

export const liveResolutionSchema = z.object({
  time: offsetDateTime,
  summary: z.string().trim().min(1).max(1500),
  sources: z.array(liveSourceSchema).min(1),
  posted_at: offsetDateTime,
});

export const liveFileSchema = z.object({
  slug: z.string(),
  updates: z.array(liveUpdateSchema).default([]),
  resolved: liveResolutionSchema.nullable().default(null),
  updated_at: offsetDateTime.nullable().default(null),
});

export const pressItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  outlet: z.string(),
  publishedAt: z.string().nullable(),
  matched: z.string(),
  firstSeen: z.string(),
});

export const pressFileSchema = z.object({
  slug: z.string(),
  generatedAt: z.string(),
  items: z.array(pressItemSchema).default([]),
});

export type LiveSource = z.infer<typeof liveSourceSchema>;
export type LiveUpdate = z.infer<typeof liveUpdateSchema>;
export type LiveResolution = z.infer<typeof liveResolutionSchema>;
export type LiveFile = z.infer<typeof liveFileSchema>;
export type PressItem = z.infer<typeof pressItemSchema>;
export type PressFile = z.infer<typeof pressFileSchema>;

/** Body accepted by POST /api/live/<slug>. */
export const livePostSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    text: z.string().trim().min(1).max(800),
    sources: z.array(z.union([httpsUrl, liveSourceSchema])).min(1, "at least one source URL is required").max(8),
    time: offsetDateTime.optional(),
  }).strict(),
  z.object({
    action: z.literal("resolve"),
    summary: z.string().trim().min(1).max(1500),
    sources: z.array(z.union([httpsUrl, liveSourceSchema])).min(1, "at least one source URL is required").max(8),
    time: offsetDateTime.optional(),
  }).strict(),
]);
export type LivePost = z.infer<typeof livePostSchema>;

/** Format an instant as Vietnam time with an explicit +07:00 offset. */
export function toVnIso(ms: number): string {
  return `${new Date(ms + 7 * 3_600_000).toISOString().slice(0, 19)}+07:00`;
}

/** "09:15 · 27/10/2026" (Vietnam time) for any ISO date-time. */
export function formatVnDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} · ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}
