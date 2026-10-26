import { z } from "zod";

/**
 * Surge Story — archive / entity pages for a story that has already peaked.
 * One JSON file per story under apps/web/content/stories/<region>/<slug>.json,
 * validated here at build time (a malformed story fails the build and tests).
 *
 * Display rules encoded in the schema:
 *  - a story never enters a Top 10 board and never shows a current Heat Score
 *    (`exclude_from_boards: true`, `show_heat_score: false` are literals);
 *  - every timeline milestone carries at least one external source;
 *  - new developments ADD milestones; old milestones are never rewritten.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const httpsUrl = z.url({ protocol: /^https$/ });
const text = z.string().trim().min(1);

export const STORY_STATUSES = ["hot", "past-peak", "echo", "ended", "archived"] as const;
export const SIGNAL_PHASES = ["first", "follow", "echo"] as const;
export const SIGNAL_PLATFORMS = ["threads", "news-vn", "youtube-vn", "google-trends-vn", "tiktok-vn", "facebook-vn", "tv-show", "other"] as const;

export const sourceRefSchema = z.object({
  url: httpsUrl,
  title: text,
  publisher: text,
  /** primary = original Vietnamese article; secondary = republication / translation. */
  role: z.enum(["primary", "secondary"]).default("primary"),
});

export const storySourceSchema = z.object({
  url: httpsUrl,
  title: text,
  publisher: text,
  date: isoDate.optional(),
  lang: z.string().min(2).max(5).default("vi"),
  kind: z.enum(["original", "republished"]).default("original"),
});

export const milestoneSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Sort / machine date. Use the source's publish date when the exact day is unknown. */
  date: isoDate,
  /** Human label shown on the page, e.g. "Đầu tháng 9/2026". */
  date_label: text,
  title: text,
  points: z.array(text).min(1),
  note: text.optional(),
  /** Reader-facing note about the sourcing of this milestone (shown under its links). */
  source_note: text.optional(),
  /** Internal editorial note; never rendered. */
  editor_note: text.optional(),
  sources: z.array(sourceRefSchema).min(1, "every milestone needs at least one external source"),
});

export const signalSchema = z.object({
  order: z.number().int().positive(),
  label: text,
  platform: z.enum(SIGNAL_PLATFORMS),
  platform_label: text,
  phase: z.enum(SIGNAL_PHASES),
  note: text,
  source_url: httpsUrl.optional(),
});

export const storySchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/).refine((s) => s !== "stories", "slug 'stories' is reserved for the index"),
    url: z.string().startsWith("/"),
    region: z.enum(["vn"]),
    name: text,
    aliases: z.array(text).default([]),
    keywords: z.array(text).default([]),
    category: z.string().regex(/^[a-z0-9-]+$/),
    category_label: text,
    entity_type: z.enum(["person", "group", "show", "brand", "event", "topic"]),
    entity_label: text,
    status: z.enum(STORY_STATUSES),
    status_label: text,
    badge: z.object({ label: text, explanation: text }),
    peak_window: z.object({ start: isoDate, peak: isoDate, end: isoDate }),
    peak_window_label: text,
    /** The only "heat" shown on a story: a past peak, never a live score. */
    peak_label: text,
    first_signal_platform: z.enum(SIGNAL_PLATFORMS),
    published: isoDate,
    last_updated: isoDate,
    last_updated_label: text,
    seo: z.object({ title: text.max(120), description: text.max(320) }),
    quick_answer: text,
    disclaimer: text,
    signals_title: text,
    signals_intro: text,
    signals: z.array(signalSchema).min(1),
    lessons: z.object({ title: text, body: text }),
    timeline: z.array(milestoneSchema).min(4, "a Surge Story needs at least 4 sourced milestones"),
    faq: z.array(z.object({ q: text, a: text })).min(1),
    follow_up: z.array(text).default([]),
    sources: z.array(storySourceSchema).min(1),
    sources_note: text.optional(),
    related_entities: z.array(text).default([]),
    newsletter: z.object({ title: text, status: z.literal("coming-soon"), label: text }),
    exclude_from_boards: z.literal(true),
    show_heat_score: z.literal(false),
  })
  .superRefine((story, ctx) => {
    if (story.url !== `/${story.region}/${story.slug}`) {
      ctx.addIssue({ code: "custom", path: ["url"], message: `url must be /${story.region}/${story.slug}` });
    }
    const listed = new Set(story.sources.map((s) => s.url));
    story.timeline.forEach((m, i) => {
      m.sources.forEach((s, j) => {
        if (!listed.has(s.url)) ctx.addIssue({ code: "custom", path: ["timeline", i, "sources", j, "url"], message: "milestone source must also appear in the story's sources list" });
      });
    });
    const ids = story.timeline.map((m) => m.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["timeline"], message: "milestone ids must be unique" });
    const orders = story.signals.map((s) => s.order);
    if (new Set(orders).size !== orders.length) ctx.addIssue({ code: "custom", path: ["signals"], message: "signal order values must be unique" });
    if (story.last_updated < story.published) ctx.addIssue({ code: "custom", path: ["last_updated"], message: "last_updated cannot be before published" });
  });

export type Story = z.infer<typeof storySchema>;
export type StoryMilestone = z.infer<typeof milestoneSchema>;
export type StorySignal = z.infer<typeof signalSchema>;
export type StorySource = z.infer<typeof storySourceSchema>;

export const PHASE_LABELS: Record<(typeof SIGNAL_PHASES)[number], string> = {
  first: "Tín hiệu đầu",
  follow: "Theo sau",
  echo: "Dư âm",
};

/** Accent colour per platform chip (CSS custom property --brand). */
export const PLATFORM_COLORS: Record<(typeof SIGNAL_PLATFORMS)[number], string> = {
  threads: "#e9e4da",
  "news-vn": "#ffb23f",
  "youtube-vn": "#ff3b3b",
  "google-trends-vn": "#4c8dff",
  "tiktok-vn": "#25f4ee",
  "facebook-vn": "#3b82f6",
  "tv-show": "#a58bff",
  other: "#98948b",
};
