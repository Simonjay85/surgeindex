# SurgeIndex production runbook

## 1. Preflight

Use a release ticket with the commit SHA, operator, approved domains/providers,
and external-smoke evidence. Confirm the tree is clean except for the reviewed
release commit and run:

```bash
git status --short
git diff --check
pnpm install --frozen-lockfile
pnpm launch:gates
```

Keep live Stripe disabled during this implementation. The expected first
production posture is `BOOST_ENABLED=false`, `BOOST_LIVE_MODE_ENABLED=false`,
`STRIPE_ENABLED=false`, `GA4_ENABLED=false`, and placement kill switches false
until their separate evidence is approved.

## 2. Build and release artifact

Build outside the live symlink, using the private production environment at
build time for the canonical URL and public keys:

```bash
pnpm install --frozen-lockfile
pnpm build
test -s tracker/build/tracker.js
test -d dist/jobs
find dist/jobs -maxdepth 1 -type f -name '*.mjs' -print | sort
```

The production job bundle contains traffic aggregation, scoring, GA4 Core,
Realtime, health, bounded backfill, and Boost operation artifacts. VPS units
execute `/usr/bin/node` against these bundles; they do not depend on the
development-only `tsx` runtime.

Copy the artifact to `/opt/surgeindex/releases/<release-id>`, set ownership and
permissions for the `ubuntu` service account, and record the build SHA and
migration count in the release manifest.

Every release directory must also contain a non-secret `release.env` so the
live health endpoint can identify the exact immutable build:

```bash
release_sha="$(git rev-parse HEAD)"
printf 'BUILD_SHA=%s\n' "$release_sha" > /opt/surgeindex/releases/<release-id>/release.env
chmod 0644 /opt/surgeindex/releases/<release-id>/release.env
```

`surgeindex.service` loads this file through `/opt/surgeindex/current`. After
the atomic symlink switch and service restart, `/api/health/live` must return
that exact SHA instead of `build: "unknown"`. Never edit tracked source inside
an installed release; if a fix is required, build and install a new SHA.

## 3. Database and network

PostgreSQL must be private. Confirm Compose binds only to loopback and inspect
the effective listener/firewall before enabling the app:

```bash
docker compose ps db
ss -ltnp | grep 55433
sudo ufw status verbose
sudo nft list ruleset
```

Run forward-only migrations against the private release database:

```bash
pnpm db:migrate
curl -fsS https://surgeindex.lol/api/health/ready
```

The readiness response must report `ready=true`, database true, migrations
true, and the expected count without exposing URLs or secrets.

## 4. Nginx and application

Install the `http{}` rate-limit zone from
`deploy/vps/nginx-http-hardening.conf`, validate the merged config and vhost,
and confirm the vhost clears client XFF and overwrites X-Real-IP. If Cloudflare
is introduced, configure and verify its published CIDR allowlist before
selecting `cloudflare_nginx`.

```bash
sudo nginx -t
sudo nginx -T
sudo systemctl enable --now surgeindex.service
sudo systemctl restart surgeindex.service
curl -fsS https://surgeindex.lol/api/health/live
```

## 5. Systemd jobs

Install/enable the units under `deploy/vps` for traffic, scoring, GA4 Core,
GA4 Realtime, GA4 health, bounded GA4 backfill, Boost reservation release,
payment reconciliation, pacing, aggregation, completion, underdelivery, local
backup, offsite backup, and backup verification.

```bash
sudo systemctl daemon-reload
sudo systemctl list-timers 'surgeindex-*' --all
sudo systemctl start surgeindex-traffic-aggregation.service
sudo systemctl start surgeindex-scoring.service
sudo journalctl -u surgeindex-traffic-aggregation.service -n 100 --no-pager
sudo journalctl -u surgeindex-scoring.service -n 100 --no-pager
```

Every Node job exits non-zero on failure, emits a safe structured status line,
and records last start/success/failure in `system_job_run`. Inspect
`/api/admin/jobs/health` as an authenticated admin. Timers should not overlap;
if a manual job is still running, wait for its `RuntimeMaxSec`/journal result
before triggering another run.

After the authenticated admin read-back, backup/restore drill, and controlled
restart exercise have produced a redacted operator evidence file, pass that
file to the read-only host probe. Without this explicit input those three
checks intentionally remain `PENDING`:

```bash
VPS_OPERATOR_EVIDENCE_FILE=/var/backups/surgeindex/release-evidence/operations-<release>.txt \
  scripts/vps-readiness.sh \
  --base-url https://surgeindex.lol \
  --operator-evidence-file /var/backups/surgeindex/release-evidence/operations-<release>.txt \
  --evidence-file /var/backups/surgeindex/release-evidence/vps-readiness-<release>.txt
```

The probe checks only exact safe status fields in that file; it never reads or
prints credentials, cookies, tokens, database URLs, or mailbox contents.

## 6. Admin bootstrap and real-site import

Create the first account through the production email flow, verify its email,
then promote exactly that account out-of-band:

```bash
ADMIN_BOOTSTRAP_CONFIRM='<exact-email>' pnpm admin:promote -- '<exact-email>'
```

There are no hard-coded admin credentials or public role-changing endpoints.

For approved real-site intake, review the CSV/JSON file, run the dry-run, and
only then apply with the double gate. The importer creates pending, non-demo
sites, validates public domains/assets/categories, writes no metrics, and skips
existing domains:

```bash
pnpm production:import -- --file /secure/reviewed/sites.csv
APP_MODE=production DATA_PROVIDER=postgres PRODUCTION_IMPORT_ALLOW=YES \
  pnpm production:import -- --file /secure/reviewed/sites.csv --apply
```

## 7. Release protection and external gates

Protect the `fix/launch-readiness` branch with required `checks` and
`migrations` workflow jobs, review, stale-approval dismissal, up-to-date branch
requirement, and force-push restriction. Do not merge or push this task’s
branch automatically.

Complete `EXTERNAL_SMOKE_TEST_CHECKLIST.md` for a real mailbox, tracker staging,
Google property, Stripe test mode, backups, and route/browser evidence. A
fixture result is not a replacement for any of those checks.

## 8. Monitoring

Monitor web process/restarts, Nginx 4xx/5xx and rate limiting, database health,
disk/backup headroom, migration/readiness, job freshness/failures, tracker
ingestion acceptance, GA4 sync/quota/error state, Stripe webhook failures and
replay queue, Boost underdelivery, and auth/email delivery. Alert on stale
`system_job_run`, repeated readiness failure, backup verification failure,
provider configuration rejection, and any unexpected demo data in a production
response.

## 9. Incident rollback

Use `ROLLBACK_RUNBOOK.md`. Keep schema forward-only, switch the app symlink only
to a compatible release, pause writes/providers before repair, and record the
release/schema/provider state in the incident ticket.
