# Surge Story — how to add a story

A **Surge Story** is an archive / entity page for a story that has already peaked
(e.g. `/vn/truong-giang`). It records *what happened, where it started and how it
spread*, with a source for every milestone. It is **not** a realtime board.

Hard rules (enforced by the schema and tests):

- Never part of a Top 10 board; never shows a current Heat Score. The only "heat" shown
  is a past peak label such as `"Đỉnh: tháng 9/2026"`. (`exclude_from_boards: true`,
  `show_heat_score: false` are required literals.)
- Every timeline milestone has **≥ 1 external source** (https), and each milestone
  source must also be listed in the story's `sources`.
- At least **4 milestones**.
- New developments **add a new milestone**; never rewrite an old one. Bump
  `last_updated` / `last_updated_label` when you add one.
- Neutral language only: "đang được bàn luận", "một số người dùng cho rằng",
  "theo bài báo…". Summarize, never copy article text, never re-post clips.

## Files

| What | Where |
| --- | --- |
| Story content (one file per story) | `apps/web/content/stories/<region>/<slug>.json` |
| Schema (zod) + platform/phase labels | `apps/web/lib/stories/schema.ts` |
| Registry (add your import here) | `apps/web/lib/stories/index.ts` |
| Page template | `apps/web/components/stories/story-view.tsx` |
| Routes | `apps/web/app/vn/[slug]/page.tsx`, index `apps/web/app/vn/stories/page.tsx` (`/vn` redirects there) |
| JSON-LD (Article, BreadcrumbList, FAQPage) | `apps/web/lib/stories/seo.ts` |
| Tests | `apps/web/tests/stories.test.tsx` |

Sitemap (`app/sitemap.ts`) and static params pick up registered stories automatically.

## Steps

1. Copy `apps/web/content/stories/vn/truong-giang.json` to `apps/web/content/stories/vn/<slug>.json`.
   `slug` is lowercase ASCII with hyphens; `url` must be `/<region>/<slug>`; `stories` is reserved.
2. Fill every field (reference below).
3. Register it in `apps/web/lib/stories/index.ts`:
   ```ts
   import myStory from "../../content/stories/vn/my-story.json";
   const RAW: unknown[] = [truongGiang, myStory];
   ```
4. Run `pnpm -F web test -- stories`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
   An invalid story fails the build with the exact field path.
5. Push to `trends-pivot` only after all of the above pass (it auto-deploys).

## Field reference

| Field | Notes |
| --- | --- |
| `slug`, `url`, `region` | `region` is `vn` for now. |
| `name`, `aliases[]`, `keywords[]` | H1 + "Biệt danh" / "Từ khóa" line. Aliases help avoid name clashes. |
| `category`, `category_label` | e.g. `showbiz-vn` / `Showbiz VN`. |
| `entity_type`, `entity_label` | `person`, `group`, `show`, `brand`, `event`, `topic`; label is free text. |
| `status`, `status_label` | `hot` (Đang nóng), `past-peak` (Đã qua đỉnh), `echo` (Dư âm), `ended` (Đã kết thúc), `archived`. |
| `badge.label`, `badge.explanation` | Status badge and the sentence under it. |
| `peak_window {start, peak, end}` | ISO dates; `peak_window_label` is the human version. |
| `peak_label` | The only heat indicator allowed, e.g. `Đỉnh: tháng 9/2026`. |
| `first_signal_platform` | One of the signal platforms below. |
| `published`, `last_updated`, `last_updated_label` | ISO dates (+ `26/10/2026` style label). `last_updated` → JSON-LD `dateModified` and sitemap. |
| `seo.title`, `seo.description` | Used verbatim (title is absolute, no site suffix appended). |
| `quick_answer`, `disclaimer` | Quick Answer box + disclaimer line. |
| `signals_title`, `signals_intro`, `signals[]` | Signal map rows: `order`, `label`, `platform` (`threads`, `news-vn`, `youtube-vn`, `google-trends-vn`, `tiktok-vn`, `facebook-vn`, `tv-show`, `other`), `platform_label`, `phase` (`first` / `follow` / `echo`), `note`, optional `source_url`. |
| `lessons.title`, `lessons.body` | "Bài học cho SurgeIndex" note. |
| `timeline[]` | `id` (anchor), `date` (ISO, for ordering — use the source's publish date when the exact day is unknown), `date_label`, `title`, `points[]`, optional `note` (shown), optional `source_note` (shown under the links, e.g. when a milestone has no dedicated article), optional `editor_note` (never shown), `sources[]` of `{url, title, publisher, role}` where `role` is `primary` (original Vietnamese article) or `secondary` (republication / translation). |
| `faq[]` | `{q, a}`; becomes the accordion and FAQPage JSON-LD. |
| `follow_up[]` | "Theo dõi tiếp" list. |
| `sources[]`, `sources_note` | "Nguồn" list: `{url, title, publisher, date, lang, kind}` with `kind` `original` / `republished`. Links render `rel="nofollow noopener noreferrer"` `target="_blank"`. |
| `related_entities[]` | Shown as tags; JSON-LD `mentions`. |
| `newsletter` | `{title, status: "coming-soon", label}` — rendered as a disabled CTA until a backend exists. |
| `exclude_from_boards`, `show_heat_score` | Must be `true` / `false`. |

## Editorial checklist (before publishing)

- [ ] **Entity + aliases + category** are set, and the name does not clash with another person/thing (add aliases to disambiguate).
- [ ] **First signal** identified: platform, date, and evidence (a source that says so).
- [ ] **Spread map** (signals) shows where it appeared first and what followed / echoed.
- [ ] **≥ 4 milestones**, each with ≥ 1 source. Fetch every URL: it returns 200 and the claims in the milestone match it. Prefer the original Vietnamese article as `primary`; keep aggregators/translations as `secondary`. Never invent URLs.
- [ ] **FAQ** written from real search queries people type about the story.
- [ ] **Clear status**: Đang nóng / Đã qua đỉnh / Dư âm / Đã kết thúc, with the badge explanation.
- [ ] **Newsletter CTA** at the bottom (comes from `newsletter`).
- [ ] Neutral wording; no verdicts; no copied article text; no re-posted clips.
- [ ] Quotes in quotation marks match the source wording.
