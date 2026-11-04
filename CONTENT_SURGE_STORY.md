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
| `live`, `live_keywords[]`, `live_started_at` | Live blog mode (see below). `live: true` requires ≥ 1 keyword and an ISO start time with offset, e.g. `2026-10-27T02:00:00+07:00`. |
| `exclude_from_boards`, `show_heat_score` | Must be `true` / `false`. Slugs `stories`, `gui-tin`, `ung-ho` are reserved. |

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

## Live blog ("Cập nhật trực tiếp")

A story with `"live": true` shows a pulsing **ĐANG CẬP NHẬT** badge, a running
list of timestamped updates (newest first), an automatic **"Báo chí đang nói
gì"** feed and a reader-tip form. Updates are **not** in the repo: they live in
`<LIVE_DATA_DIR>/<slug>.json` (production: `/opt/surgeindex/shared/live/`,
derived from `TRENDS_DATA_DIR`; locally `apps/web/data/live/`, git-ignored) and
are read on every request (the story page is rendered dynamically; open pages
also refresh themselves every 60 s), so **posting an update never needs a
rebuild** and shows up immediately.

| What | Where |
| --- | --- |
| Turn live mode on | Story JSON: `"live": true`, `"live_keywords": [...]`, `"live_started_at": "…+07:00"` (this part *does* need a commit + deploy) |
| Updates + resolution | `/opt/surgeindex/shared/live/<slug>.json` — written only by the API |
| Press matches | `/opt/surgeindex/shared/live/<slug>.press.json` — written by the hourly ingest (minute 5) from the news-vn RSS articles whose **headline** contains a keyword (diacritics ignored, whole phrase) |
| API | `GET /api/live/<slug>` (public JSON) · `POST /api/live/<slug>` (Bearer `LIVE_ADMIN_TOKEN`) |
| Code | `lib/live/*`, `components/stories/live-blog.tsx`, `app/api/live/[siteId]/route.ts` (the segment is shared with the legacy site-id route) |
| JSON-LD | `LiveBlogPosting` with `coverageStartTime`, `coverageEndTime` (once resolved) and `liveBlogUpdate[]` |

Rules (same as the rest of this file, plus):

- Every update: short, neutral text (≤ 800 chars), **≥ 1 https source URL**, a
  time with `+07:00`. Only post what a source actually says ("theo VnExpress…").
- **Append only.** The API cannot edit or delete an update. A correction is a
  *new* update that says what changed ("Đính chính: …"). If something must be
  removed for legal reasons, edit the JSON file on the server by hand and note
  it in the next update.
- Never invent updates to fill the list; an empty list shows an empty state.
- `LIVE_ADMIN_TOKEN` unset → `POST` returns **503** (feature off). Wrong token → 401.

### Post an update (curl)

```bash
export SI_TOKEN='<LIVE_ADMIN_TOKEN>'   # never commit or paste it in chat logs
curl -sS -X POST https://surgeindex.lol/api/live/truong-giang \
  -H "Authorization: Bearer $SI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "text": "Theo VnExpress, nhà sản xuất 2 Ngày 1 Đêm xác nhận …",
        "sources": ["https://vnexpress.net/…html"],
        "time": "2026-10-27T09:30:00+07:00"
      }'
# 201 {"ok":true,"action":"update","entry":{…},"updates":1,"resolved":false}
```

- `time` is optional (defaults to now, Vietnam time). Use the time the event
  happened / the source published, with `+07:00`.
- `sources` accepts plain URLs or objects:
  `{"url": "https://…", "publisher": "Tuổi Trẻ", "title": "…"}`.
- `422` lists exactly which field is wrong (e.g. missing source).

### Resolve a story (final "Kết quả / Diễn biến cuối")

```bash
curl -sS -X POST https://surgeindex.lol/api/live/truong-giang \
  -H "Authorization: Bearer $SI_TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"resolve","summary":"Tóm tắt trung lập kết quả cuối cùng …","sources":["https://…"]}'
```

The badge switches to **ĐÃ KẾT THÚC**, auto-refresh stops, the final section
appears above the updates and JSON-LD gets `coverageEndTime`. A story can be
resolved once (`409` afterwards). Afterwards, in a normal commit, consider
setting `"status": "ended"`, adding the outcome as a timeline milestone and
setting `"live": false` (the runtime file stays on disk and is simply no
longer shown).

### Check what is live

```bash
curl -s https://surgeindex.lol/api/live/truong-giang | jq '{live, updated_at, n: (.updates|length), press: (.press|length)}'
```

## Reader tips ("Gửi tin nóng")

Form on `/vn/gui-tin`, `/vn/stories` and every live story. Fields: chủ đề
(required), link nguồn (required URL), ghi chú (≤ 1000), email (optional).
Turnstile (`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`, action `tip`), 5
tips/hour per IP (in-memory), stored as one JSON line per tip in
`/opt/surgeindex/shared/tips/tips.jsonl` (salted IP hash, never the raw IP),
plus an email to `TIPS_NOTIFY_EMAIL` (default simonjay0805@gmail.com) through
the existing Resend setup (`EMAIL_PROVIDER=http`; skipped silently otherwise).
Tips are **never** published automatically — verify the source, then post a
live update or a milestone yourself.

## Donate ("Ủng hộ SurgeIndex", `/vn/ung-ho`)

Env-only, nothing hard-coded: `DONATE_BANK_BIN` (or `DONATE_BANK_CODE`),
`DONATE_ACCOUNT_NO`, `DONATE_ACCOUNT_NAME`, optional `DONATE_BANK_NAME`,
`DONATE_MOMO_PHONE`, `DONATE_INTL_URL` (https). With none set the page says
"Sắp ra mắt" and the footer/story links are hidden. The VietQR image is
`https://img.vietqr.io/image/<bank>-<account>-compact2.png?addInfo=UNG+HO+SURGEINDEX&accountName=…`.
Set them as GitHub repo secrets; the deploy workflow writes them to
`/etc/surgeindex/surgeindex.env` and the next deploy picks them up.
