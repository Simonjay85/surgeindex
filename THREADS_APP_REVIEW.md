# Meta App Review dossier — Threads `threads_keyword_search` (+ `threads_basic`)

Ready-to-paste material for submitting **SurgeIndex** to Meta App Review so the
Threads Keyword Search API can return **public** posts. Nothing here is built
yet: Threads ingestion stays off until the permission is approved.

> Source for every limit below: Meta, *Keyword and Topic Tag Search*,
> https://developers.facebook.com/documentation/threads/keyword-search (page
> marked "Updated: Jan 21, 2026"; re-read on 2026-10-27). Re-check it right
> before submitting — Meta changes these pages without notice.

---

## 1. Facts to keep in mind

| Item | What Meta documents |
| --- | --- |
| Endpoint | `GET https://graph.threads.net/v1.0/keyword_search` (also `graph.threads.com`); `q` is the only required parameter |
| Permissions | `threads_basic` (required for every Threads call) + `threads_keyword_search` (required for keyword search) |
| Before approval | Search runs **only on posts owned by the authenticated user** — this is why App Review is needed |
| Query cap | **2,200 queries per user per rolling 24 h**, counted across all apps for that user; repeat queries for the same keyword count again; **queries that return no results do not count** |
| Page size | `limit` default **25**, maximum **100** posts per request |
| Other params | `search_type` = `TOP` (default) or `RECENT`; `search_mode` = `KEYWORD` or `TAG`; `media_type`; `since` / `until`; `author_username` |
| Sensitive terms | The API returns an empty array for keywords Meta deems sensitive or offensive |
| Fields | Media fields such as `id, text, media_type, permalink, timestamp, username, has_replies, is_quote_post, is_reply`; the `owner` field is never returned |

**Budget plan (our arithmetic, not a Meta figure):** a watchlist of at most
40 Vietnamese keywords queried once per hour = 960 queries/day, well under
2,200 even with retries. Hard cap in code: 1,800 queries per rolling 24 h,
`limit=100`, `search_type=RECENT`, one page per keyword per hour.

---

## 2. App details (paste into the app dashboard)

- **App name:** SurgeIndex
- **App type / use case:** "Access the Threads API" use case
- **Category:** News / Utilities (pick the closest available)
- **App domain:** `surgeindex.lol`
- **Website / Site URL:** `https://surgeindex.lol`
- **Privacy Policy URL:** `https://surgeindex.lol/privacy` (must be public, in English and Vietnamese ideally, and contain the Threads section in §5 below — **update the page before submitting**)
- **Terms of Service URL:** `https://surgeindex.lol/terms`
- **User data deletion:** "Data Deletion Instructions URL" → `https://surgeindex.lol/privacy#threads-data` (anchor to the deletion paragraph in §5)
- **App icon:** 1024×1024 SurgeIndex logo (the gradient pulse mark from `apps/web/app/icon.svg`, exported to PNG)
- **Contact email:** simonjay0805@gmail.com

### Short app description (≤ 400 characters)

> SurgeIndex (surgeindex.lol) is a free public dashboard of what is trending
> in Vietnam right now. Every hour it reads public charts (Google Trends,
> YouTube, Wikipedia, Vietnamese news RSS) and shows an aggregated Top 10 with
> links back to each source. We want to add public Threads conversation
> volume for a short watchlist of trending Vietnamese topics.

---

## 3. Use-case explanation for `threads_keyword_search`

Paste into the "How will your app use this permission?" box:

> **What SurgeIndex is.** SurgeIndex is a free, public website that shows what
> is trending in Vietnam each hour (for example "Báo VN đang nóng", a board of
> stories covered by several Vietnamese newspapers at once). Each item links
> back to its original source.
>
> **Why we need keyword search.** Many Vietnamese stories start on Threads
> before newspapers or Google pick them up. We want to show, for a short
> watchlist of topics that are already trending on our other boards (at most
> 40 keywords at a time, chosen by our editor), *how much public Threads
> conversation there is*.
>
> **What we call.** Once per hour, for each watchlist keyword, our server
> makes one `GET /keyword_search` request with `q=<keyword>`,
> `search_type=RECENT`, `limit=100` and a `since` timestamp of the previous
> hour, using the access token of our own SurgeIndex Threads account. We stay
> well under the 2,200 queries per rolling 24 hours limit (≤ 40 queries per
> hour, hard cap 1,800/day).
>
> **What we show.** Only aggregates: number of public posts in the last hour
> and last 24 hours, and the change versus the previous day, per keyword. For
> each keyword we link to up to 3 public posts via their Threads `permalink`
> so readers can read them on Threads. We do not display post text beyond what
> Threads embeds, and we never show usernames as a list.
>
> **What we do not do.** No data resale or sharing with third parties. No
> advertising use. No profiling, scoring or tracking of individual users. No
> storage of `username` beyond the hour it takes to de-duplicate posts. No
> reposting, replying, quoting or liking on anyone's behalf. No login for our
> visitors — the only Threads account that authorizes the app is SurgeIndex's
> own account.
>
> **Why `threads_basic`.** Required by Meta for every Threads API call
> (token validation, `/me` for our own account id).

---

## 4. Screencast script (2–3 minutes, 1080p, English captions or voice-over)

Reviewers must see the permission being used end-to-end. Record on desktop in
an incognito window; zoom the browser to 125 % so text is readable.

1. **0:00 — Context.** Open `https://surgeindex.lol/`. Caption: "SurgeIndex
   is a public hourly Top 10 of what is trending. No visitor login."
   Switch the region toggle to **Vietnam** and scroll to the "Báo VN đang
   nóng" board.
2. **0:20 — The Threads gap.** Open `https://surgeindex.lol/vn/truong-giang`,
   scroll to "Bản đồ tín hiệu". Caption: "This story started on Threads before
   any newspaper. We want to measure that public signal."
3. **0:40 — App authorization.** Open the SurgeIndex admin page that starts
   the Threads OAuth flow (to be built: `/admin/threads/connect`). Click
   **Connect Threads**, log in with the **SurgeIndex** Threads test account,
   show the consent screen listing `threads_basic` and
   `threads_keyword_search`, click **Allow**. Show the success page with the
   connected username and token expiry (token itself masked).
4. **1:10 — Keyword search call.** On the admin watchlist page, show the
   list of keywords (e.g. "Trường Giang", "2 ngày 1 đêm"). Click **Run now**
   on one keyword. Show the server log panel: `GET /keyword_search
   q=Trường Giang search_type=RECENT limit=100` → `200`, `N posts`.
5. **1:40 — Result on the public site.** Open the public board/story page
   and show the new "Threads" row: post count last hour / 24 h, trend arrow,
   and 3 links "Xem trên Threads". Click one: it opens the post on
   threads.com (permalink).
6. **2:10 — Data handling.** Open `https://surgeindex.lol/privacy#threads-data`
   and highlight the retention (24 h for raw results, aggregates only after)
   and deletion paragraphs.
7. **2:30 — End.** Caption: "Only aggregated counts and links back to Threads.
   No resale, no profiling, no actions on behalf of users."

Upload as MP4 (≤ 2 GB). If the admin page is not finished, the screencast can
use Graph API Explorer for step 4 — but reviewers strongly prefer the real app.

---

## 5. Data handling, retention and deletion (privacy policy text)

Add this section (Vietnamese + English) to `/privacy` with the anchor
`id="threads-data"` before submitting.

**English**

> **Threads data.** SurgeIndex uses the Threads API (Meta) to search
> *public* Threads posts for a short list of trending keywords chosen by our
> editors. We receive public post metadata (post id, text, media type,
> permalink, timestamp, author username, reply/quote flags).
>
> *Use:* we compute aggregate counts per keyword (posts in the last hour and
> last 24 hours) and link to a few public posts on threads.com. We do not
> sell, rent or share Threads data, do not use it for advertising, and do not
> build profiles of individual people.
>
> *Retention:* raw search results are kept for at most 24 hours (to
> de-duplicate posts between hourly runs) and then deleted. Only aggregate
> counts per keyword and the permalinks of the few linked posts are kept,
> for up to 90 days, after which they are deleted. Our access token is stored
> encrypted on our server and never exposed to visitors.
>
> *Deletion:* if a post is deleted on Threads, it stops being linked at the
> next hourly refresh. To ask us to delete any Threads data about you or to
> stop linking a post, email simonjay0805@gmail.com with the post link; we act
> within 7 days. Disconnecting the SurgeIndex app from your Threads account
> (Threads → Settings → Account → Website permissions) revokes our access;
> we then delete the token and all raw data within 24 hours.

**Tiếng Việt**

> **Dữ liệu Threads.** SurgeIndex dùng Threads API (Meta) để tìm các bài đăng
> *công khai* trên Threads theo một danh sách ngắn từ khóa đang nóng do biên
> tập viên chọn. Chúng tôi chỉ đếm số bài theo từng từ khóa và dẫn link về
> vài bài công khai trên threads.com. Không bán, không chia sẻ, không dùng cho
> quảng cáo, không lập hồ sơ cá nhân. Kết quả thô được xóa sau tối đa 24 giờ;
> số liệu tổng hợp và link giữ tối đa 90 ngày. Muốn xóa dữ liệu hoặc gỡ link
> một bài: gửi email kèm link bài tới simonjay0805@gmail.com, chúng tôi xử lý
> trong 7 ngày.

---

## 6. Exact steps for Aaron in developers.facebook.com

1. **Meta developer account.** Go to https://developers.facebook.com/ → log in
   with the Facebook account that will own the app → *Get started* if you have
   never registered (verify phone + email).
2. **Create the app.** *My Apps* → **Create app** → app name "SurgeIndex",
   contact email → on *Use cases* choose **Access the Threads API** → (business
   portfolio: pick or create "SurgeIndex"; you can skip at first, but App
   Review for advanced access will require one) → *Create app*.
3. **Customize the use case.** *Use cases* → *Access the Threads API* →
   **Customize** → *Permissions*: `threads_basic` is already required; click
   **Add** next to **`threads_keyword_search`**. Leave publish/delete/replies
   permissions off (we do not need them, and extra permissions slow review).
4. **Settings.** *Use cases → Access the Threads API → Settings*:
   - Redirect callback URL: `https://surgeindex.lol/api/threads/callback`
   - Uninstall callback URL: `https://surgeindex.lol/api/threads/uninstall`
   - Delete callback URL: `https://surgeindex.lol/api/threads/delete`
   (these routes are built together with ingestion; Meta only needs them to
   exist and return 200 when reviewing).
   *App settings → Basic*: fill App domain, Privacy Policy URL, Terms URL,
   Data Deletion Instructions URL, category and icon (values in §2). Save.
5. **Add a tester.** *App roles → Roles* → **Add People** → *Threads Tester*
   → enter the SurgeIndex Threads username. Then on Threads (logged in as that
   account): *Settings → Account → Website permissions → Invites* → **Accept**.
6. **Test with standard access.** Use *Graph API Explorer* (select the app,
   "Threads" token, scopes `threads_basic,threads_keyword_search`) and call
   `keyword_search?q=<a word you posted>` to confirm the token works (results
   are limited to your own posts until approval). Make ≥ 1 successful call of
   each permission — App Review requires recent successful test calls.
7. **Business verification (if prompted).** *Settings → Business portfolio →
   Security Center → Start verification*: legal name, address, phone, website
   `surgeindex.lol`, a document (business registration, or utility bill / tax
   document in the legal name), and domain or email verification. Takes from
   1 to 14 days. Advanced access to `threads_keyword_search` may also show an
   *Access verification* step — answer it the same way as §3.
8. **Submit for App Review.** *App Review → Requests* (or the "Review" tab of
   the use case) → **Request advanced access** for `threads_keyword_search`
   (and `threads_basic` if listed) → paste §3 into the usage description →
   upload the screencast (§4) → give testing instructions: the public URLs plus
   the tester account login (create a dedicated reviewer password; never share
   your personal account) → confirm data-handling questions (§5: no resale, no
   sharing, deletion on request) → **Submit**.
9. **After approval.** Switch the app to **Live** mode (*App settings →
   Basic → App mode*). Then build ingestion: long-lived token (60 days,
   refresh before expiry), hourly watchlist search with the caps in §1, and
   the privacy anchor. If rejected, read the reviewer notes, fix exactly what
   they name (usually the screencast or privacy page), and resubmit.

---

## 7. Checklist before pressing Submit

- [ ] `/privacy` has the §5 section with `id="threads-data"` (EN + VI) and is publicly reachable.
- [ ] `/terms` reachable; app icon, category, domain filled.
- [ ] Callback URLs respond 200.
- [ ] Tester invited **and accepted** on Threads.
- [ ] At least one successful `threads_basic` and one `keyword_search` call in the last 30 days.
- [ ] Screencast shows: login + consent with both permissions, a real search call, the public result linking back to Threads, the privacy section.
- [ ] Reviewer test credentials work (no 2FA prompt, or 2FA codes provided).
- [ ] Business verification completed if the dashboard asks for it.
