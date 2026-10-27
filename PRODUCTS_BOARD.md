# Board "Sản phẩm đang lên" (thử nghiệm)

Weekly, hand-curated product board at **`/top-10/san-pham-dang-len`**. Ranked by
search-interest velocity in Vietnam, never by quality or commission. It does
**not** use the hourly ingest (`scripts/ingest-trends.ts`,
`apps/web/lib/trends/ingest.ts`), and nothing scrapes Shopee or TikTok Shop.

| Piece | File |
| --- | --- |
| Data (one week) | `apps/web/data/products-vn.json` |
| Schema + helpers | `apps/web/lib/products/index.ts` |
| Page | `apps/web/app/top-10/san-pham-dang-len/page.tsx` |
| View | `apps/web/components/products/products-board.tsx` |
| Tests | `apps/web/tests/products-board.test.tsx` |

## The `status` flag

| | `"draft"` | `"published"` |
| --- | --- | --- |
| Page URL | renders (preview) | renders |
| `<meta name="robots">` | `noindex, nofollow` | indexable |
| Card on `/top-10` | hidden | shown ("Thử nghiệm · hàng tuần") |
| `sitemap.xml` | not listed | listed, `weekly`, `lastModified = updatedAt` |
| `/methodology#san-pham-dang-len` section | hidden | shown |
| "Bản nháp · chưa công khai" chip | shown | hidden |

The "Thử nghiệm" badge and the affiliate disclosure always show.
Only flip to `"published"` after Aaron approves the week's data **and** links.

## Data rules (enforced by the zod schema / tests)

- `items`: 1–10, listed in rank order (`rank` = 1..n), highest growth first.
- Every item has `signals` with ≥ 1 entry: `source` (`google-trends-vn` or
  `tiktok-top-products-vn`), `evidence` (one Vietnamese sentence with the
  measured numbers), `evidenceUrl` (https; Google Trends explore URL or TikTok
  Creative Center page), `observedAt` (ISO with offset, e.g.
  `2026-10-27T16:40:00+07:00`). Optional `changePct` (shown as the big "+N%")
  and `window` `{ current, previous }`.
- `buyLinks`: `[]` until Aaron supplies real affiliate links. Each link is
  `{ "retailer": "Shopee" | "TikTok Shop", "url": "https://…", "disclosure": true }`.
  Never invent or guess an affiliate link.
- `priceNote`: `null` unless the price was checked on the product page that
  week; then write it with the check date ("Giá 249.000đ trên Shopee, kiểm tra 03/11/2026").
- `note`: one neutral sentence on *why it is on the board* (the signal), no praise or criticism.
- No marketplace product images, no sales counts, no star ratings, no "bán chạy nhất"/"rẻ nhất".

## Weekly update (≈ 30–45 min, e.g. every Monday)

1. **Shortlist** 30–60 product keywords (seasonal, launches, gift days, sale events).
2. **Measure on Google Trends** (geo=VN, one keyword per request, daily data for
   the last 14 days). Growth % = mean of the last 7 days ÷ mean of the previous
   7 days − 1. Drop keywords whose series is mostly zeros (too little volume to
   measure) and pure event names (e.g. "11.11", "black friday") that are not products.
   Evidence URL format:
   `https://trends.google.com/trends/explore?date=YYYY-MM-DD%20YYYY-MM-DD&geo=VN&q=<keyword>&hl=vi`
   (The week-1 run used the Trends explore + widgetdata/multiline endpoints from a
   script with ~2.5 s between keywords; it hits HTTP 429 after ~60 keywords.)
3. *(Optional)* **TikTok Creative Center → Top Products → Vietnam**: note which
   items entered/climbed the top list, with the snapshot date, as a second signal.
4. **Pick the 10** with the clearest measured growth, write `products-vn.json`:
   bump `week` (ISO week, `2026-W44`), `periodLabel`, `updatedAt`, `method` if it changed.
5. **Affiliate links**: Aaron sends the Shopee Affiliate / TikTok Shop Affiliate
   links per item, or (TikTok Shop, approved AccessTrade campaign
   `6648523843406889655`) search `GET https://api.accesstrade.vn/v2/tiktokshop_product_feeds?sort_field=BEST_SELLERS&limit=20&title_keywords=<từ khóa>`,
   pick one in-stock product whose title clearly matches the item, and create the
   link with `POST https://api.accesstrade.vn/v1/product_link/create`
   `{"campaign_id":"6648523843406889655","urls":["<detail_link>"],"utm_source":"surgeindex"}`
   (use `aff_link`). No match → no link. The Shopee AccessTrade campaign
   (`4751584435713464237`) was not registered as of 27/10/2026. TikTok `units_sold`
   is not shown (no sales counts on the board). Paste each into that item's `buyLinks`, open every link once
   to check it resolves to the right product. Items without links show
   "Link mua đang cập nhật".
6. **Publish**: when Aaron approves, set `"status": "published"`.
7. Run `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint`,
   commit, push to `trends-pivot`. The push auto-deploys
   (`.github/workflows/deploy-vps.yml`); never edit the VPS by hand.
8. **Log the week** (items, signals, last week's buy-link CTR if available) in
   the project notes; CTR thresholds for the 2-week trial are in the board spec.

Buy buttons render as `Mua trên Shopee · Link affiliate` /
`Mua trên TikTok Shop · Link affiliate` with `rel="sponsored nofollow noopener noreferrer"`.
