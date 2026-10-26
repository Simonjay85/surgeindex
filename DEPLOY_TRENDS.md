# Deploying the SurgeIndex Top 10 (trends-pivot) on the aaPanel VPS

Phase 1 adds no new services. The site is still one `next start` process; the
Top 10 data comes from one small Node script run hourly by cron that writes
JSON files. No database, Redis, Tinybird or Cloudflare is needed for the trend
pages (the existing app still parses `APP_MODE`/`DATA_PROVIDER` at boot, so keep
the current production env file as it is).

> Do not run these steps blind on production — they are the operator runbook.
> Nothing in this branch touches the VPS by itself.

## 0. What runs where

| Piece | Command | Memory | Notes |
| --- | --- | --- | --- |
| Web | `next start` on `127.0.0.1:3211` (existing `surgeindex.service`) | unchanged | Trend pages are ISR: re-read the JSON at most every 5 min. |
| Ingest | `tsx scripts/ingest-trends.ts` (`pnpm trends:ingest`) hourly | ~80–120 MB for ~5–10 s | Sequential requests, lock file, 15 s timeout per request. |
| Data | `TRENDS_DATA_DIR` (recommended `/opt/surgeindex/shared/trends`) | ~40 KB/hour | `latest.json`, `history/` (7 days, auto-pruned), `daily/` (one file per UTC day, kept for archive pages). |

## 1. Environment

Add to `/etc/surgeindex/surgeindex.env` (read by the web service):

```bash
TRENDS_DATA_DIR=/opt/surgeindex/shared/trends
NEXT_PUBLIC_APP_URL=https://surgeindex.lol   # already present; used for canonical/OG/sitemap
```

Create `/etc/surgeindex/trends.env` (read by the cron job; must be readable by the `ubuntu` user, mode 0640 root:ubuntu):

```bash
TRENDS_DATA_DIR=/opt/surgeindex/shared/trends
# Optional — enables the YouTube boards (US + VN). Without it the board shows "Coming soon".
YOUTUBE_API_KEY=
# Optional — Reddit app-only OAuth (create a "script" app at https://www.reddit.com/prefs/apps).
# Without it Reddit is read from the public JSON, falling back to the RSS feed (no vote counts).
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
```

Create the data directory once (it lives outside release dirs so history survives deploys, and inside `ReadWritePaths=/opt/surgeindex` of the systemd unit):

```bash
sudo mkdir -p /opt/surgeindex/shared/trends
sudo chown -R ubuntu:ubuntu /opt/surgeindex/shared
```

## 2. Build a release (same flow as `PRODUCTION_RUNBOOK.md`)

```bash
RELEASE=/opt/surgeindex/releases/$(date -u +%Y%m%d%H%M)-trends
git clone --branch trends-pivot https://github.com/Simonjay85/surgeindex.git "$RELEASE"
cd "$RELEASE"
pnpm install --frozen-lockfile

# Seed fresh data before building so the prerendered pages start current.
set -a; . /etc/surgeindex/trends.env; set +a
pnpm trends:ingest

# Build with the production env (same as today).
set -a; . /etc/surgeindex/surgeindex.env; set +a
NODE_OPTIONS=--max-old-space-size=1536 pnpm build
```

If the VPS is tight on RAM during `next build`, stop other heavy processes first
or build on another machine and rsync the release directory — the runtime needs
far less memory than the build.

## 3. Switch and restart

```bash
ln -sfn "$RELEASE" /opt/surgeindex/current
sudo systemctl restart surgeindex.service
sudo systemctl status surgeindex.service --no-pager
curl -sI http://127.0.0.1:3211/ | head -1                    # 200
curl -s  http://127.0.0.1:3211/api/trends | head -c 200      # compact JSON snapshot (full: /api/trends/full)
curl -s  http://127.0.0.1:3211/sitemap.xml | grep -c "<loc>" # > 10
```

The unit's start command stays exactly as it is:
`/usr/bin/node /opt/surgeindex/current/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3211`.
No Nginx change is needed (same port, same vhost).

## 4. Hourly cron

aaPanel → Cron → Add task → type "Shell Script", run as `ubuntu`, schedule "every hour at minute 5", script:

```bash
cd /opt/surgeindex/current && \
TRENDS_ENV_FILE=/etc/surgeindex/trends.env TRENDS_DATA_DIR=/opt/surgeindex/shared/trends \
NODE_OPTIONS=--max-old-space-size=256 \
/usr/bin/flock -n /tmp/surgeindex-trends.lock timeout 300 \
node_modules/.bin/tsx scripts/ingest-trends.ts >> /var/log/surgeindex/trends-ingest.log 2>&1
```

Or as a plain crontab line (`crontab -e` as `ubuntu`):

```cron
5 * * * * cd /opt/surgeindex/current && TRENDS_ENV_FILE=/etc/surgeindex/trends.env TRENDS_DATA_DIR=/opt/surgeindex/shared/trends NODE_OPTIONS=--max-old-space-size=256 /usr/bin/flock -n /tmp/surgeindex-trends.lock timeout 300 node_modules/.bin/tsx scripts/ingest-trends.ts >> /var/log/surgeindex/trends-ingest.log 2>&1
```

(`sudo mkdir -p /var/log/surgeindex && sudo chown ubuntu:ubuntu /var/log/surgeindex` once.)

Exit codes: `0` ok (some boards may be "Delayed"), `1` aborted (lock held / disk error), `2` every source failed.
Each run logs one line per board, e.g.
`[trends] reddit  live  10 items via reddit rss (no vote counts)`.

## 5. Verify after the first cron run

```bash
tail -n 12 /var/log/surgeindex/trends-ingest.log
ls -la /opt/surgeindex/shared/trends /opt/surgeindex/shared/trends/history | tail
```

Pages pick the new snapshot up within 5 minutes (ISR). "Updated X minutes ago"
in the header turns amber if the newest snapshot is older than 3 hours — that is
the signal that cron stopped.

## 6. Without the release layout (plain aaPanel Node project)

```bash
cd /www/wwwroot/surgeindex            # repo checkout on branch trends-pivot
pnpm install --frozen-lockfile
cp .env.example apps/web/.env         # then set APP_MODE/DATA_PROVIDER as you run today, NEXT_PUBLIC_APP_URL, TRENDS_DATA_DIR
pnpm trends:ingest
pnpm build
pnpm start -- --hostname 127.0.0.1 --port 3211   # or aaPanel "Node project": start command "pnpm start", port 3211
```

Cron: same as section 4 with `cd /www/wwwroot/surgeindex`.
Keep `TRENDS_DATA_DIR` outside the git checkout so `git pull` never conflicts with data files.

## 7. Rollback

Point `/opt/surgeindex/current` back at the previous release and restart
`surgeindex.service`. Remove the cron task. The trend data directory can stay;
nothing else reads it.

## 8. Live blog, tips, donate (runtime data + secrets)

`scripts/deploy-vps.sh` creates `/opt/surgeindex/shared/live` and
`/opt/surgeindex/shared/tips` (owned by `ubuntu`, inside the service's
`ReadWritePaths`). Both are derived from `TRENDS_DATA_DIR`; override with
`LIVE_DATA_DIR` / `TIPS_DATA_DIR` only if needed.

Optional GitHub repo secrets synced on every deploy (same mechanism as
`YOUTUBE_API_KEY`). Ingest keys go to `trends.env`; web-runtime keys go to
`/etc/surgeindex/surgeindex.env` (loaded by `surgeindex.service`):

| Secret | File | Effect when unset |
| --- | --- | --- |
| `LIVE_ADMIN_TOKEN` | surgeindex.env | `POST /api/live/<slug>` returns 503 |
| `DONATE_BANK_BIN` or `DONATE_BANK_CODE`, `DONATE_ACCOUNT_NO`, `DONATE_ACCOUNT_NAME`, `DONATE_BANK_NAME` | surgeindex.env | no bank QR |
| `DONATE_MOMO_PHONE`, `DONATE_INTL_URL` | surgeindex.env | channel hidden; all unset → "Sắp ra mắt", footer link hidden |

Removing a secret does not delete the old line from the env file; to retire a
value, set the secret to a new value or remove the line on the VPS.
Content workflow (posting updates, resolving): `CONTENT_SURGE_STORY.md`.

## Routes added

- `/` — live Top 10 overview (ticker, spotlight, all boards, Global/Vietnam toggle)
- `/top-10` — board index
- `/top-10/[source]` — `google-trends`, `news` (Báo VN đang nóng, board id `news-vn`), `youtube`, `reddit`, `hackernews`, `github` (`x` is a noindex "coming soon")
- `/vn/gui-tin` (reader tips), `/vn/ung-ho` (donate), `POST /api/tips`, `GET|POST /api/live/<slug>`
- `/top-10/[source]/[YYYY-MM-DD]` — daily archive (UTC), ISR 30 min
- `/api/trends` — latest snapshot JSON (compact: every board and item, no thumbnails / why-lines / rank history; stays well under 64 KB so the deploy health check `curl | head -c 1` under `pipefail` keeps passing)
- `/api/trends/full` — full latest snapshot JSON
- `/sitemap.xml` — now built from snapshots only (no database query)

Legacy routes (`/rankings`, `/dashboard`, `/boost`, `/claim`, `/pricing`, `/creators`, `/campaigns`, …) still exist in code but are removed from navigation, the home page and the sitemap, and disallowed in `robots.txt`.
