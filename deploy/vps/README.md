# SurgeIndex VPS deployment

## Network and proxy trust

PostgreSQL is loopback-only in the supplied Compose file. Verify both the
Compose bind and the host firewall before starting the app:

```bash
docker compose ps db
ss -ltnp | grep 55433
sudo ufw status verbose
sudo nft list ruleset
```

The application ignores `X-Forwarded-For`. In direct-Nginx mode, Nginx
overwrites `X-Real-IP` from the connected peer and the app uses that value only
after `TRUSTED_PROXY_MODE=direct_nginx` is explicitly set. The Fanward release
checker deliberately rejects every active Nginx `real_ip` directive. Moving
behind Cloudflare therefore requires a separately reviewed CIDR-aware release
contract and checker change; changing only `TRUSTED_PROXY_MODE` is invalid.

Include `nginx-http-hardening.conf` from the main `http{}` block. It provides
the anonymous mutation zone plus a URI map and separate
`surgeindex_fanward_public` zone. Apply the Fanward `limit_req`, 429, and
explicit dry-run-off directives at server scope in both canonical TLS vhosts;
an empty map key leaves unrelated routes unaccounted and preserves the existing
production/staging routing and staging Basic Auth. The protected URI set covers
`/fanward`, `/creators`, dynamic `/sitemap.xml`, both public/admin Fanward APIs,
and owner/admin Fanward pages. Confirm the active map, both TLS servers, their
catch-all upstreams (`3211` production, `3212` staging), auth inheritance, and
absence of diverting child locations or real-IP rewriting with `sudo nginx -t`,
`sudo nginx -T`, and `pnpm nginx:release-check`.

Production runs as one self-hosted Next.js process behind the existing panel
Nginx, with a dedicated PostgreSQL container bound to localhost only.

Runtime boundaries:

- canonical host: `https://surgeindex.lol`
- Next.js listener: `127.0.0.1:3211`
- PostgreSQL listener: `127.0.0.1:55433`
- application releases: `/opt/surgeindex/releases/<release-id>`
- active symlink: `/opt/surgeindex/current`
- private environment: `/etc/surgeindex/surgeindex.env`
- database volume: `surgeindex-pgdata`
- database container: `surgeindex-db`
- systemd service: `surgeindex.service`
- live traffic timer: `surgeindex-traffic-aggregation.timer`
- scoring and ranking timer: `surgeindex-scoring.timer`
- GA4 backfill timer: `surgeindex-ga4-backfill.timer` (Commercial phase only)
- HiGuppy WooCommerce revenue timer: `surgeindex-higuppy-revenue.timer` (disabled for Public Free)
- database backup timer: `surgeindex-postgres-backup.timer`
- local backup retention: 14 days under `/var/backups/surgeindex/postgres`
- encrypted offsite backup timer: `surgeindex-postgres-backup-offsite.timer`
- offsite backup verification timer: `surgeindex-postgres-backup-verify.timer`
- backup environment: `/etc/surgeindex/backup.env`
- age identity: `/etc/surgeindex/backup.agekey`
- panel Nginx vhost: `/www/server/panel/vhost/nginx/surgeindex.lol.conf`

The first certificate is issued with `surgeindex.http.nginx.conf`, then the
vhost is atomically replaced with `surgeindex.nginx.conf`. Always test with
`/www/server/nginx/sbin/nginx -t` before reloading the panel Nginx master.

Production is deliberately fail-closed. Public Free requires
`NEXT_PUBLIC_COMMERCIAL_ENABLED=false`, Stripe, Boost, GA4, every paid
placement, and the public revenue board to remain disabled until their real
provider credentials and operational requirements are supplied.
The first-party tracker may run through the local Postgres/queue/realtime path
on this single-process deployment when all three tracker secrets are present.

## Read-only acceptance probe

From the checked-out release directory, run the repository probe before any
installation or restart:

```bash
scripts/vps-readiness.sh --evidence-file /var/tmp/surgeindex-vps-readiness.txt
```

It checks repository assets, loopback database configuration, effective Nginx
syntax/read-back, PostgreSQL listener binding, UFW/nftables visibility,
systemd services/timers/journal presence, health endpoints, and disk
headroom. It is read-only: it does not install packages, reload Nginx, change
firewall rules, modify systemd, restart the application, or reset a database.
The probe reports host-dependent checks as `BLOCKED`/`PENDING` when the host
does not expose the required command or evidence. Use the install and restart
commands below and `PRODUCTION_RUNBOOK.md` only as explicit operator actions.

The backup/restore helpers emit safe structured journal lines for timestamp,
file/size, upload/verification, restore duration, database size, migration
count, readiness, and owner-approved RPO/RTO placeholders. They never print
database URLs, age identities, or provider credentials.

Install `surgeindex-postgres-backup` as root-owned mode `0750`, install the
matching service and timer under `/etc/systemd/system`, then enable the timer.
Run the service once and validate the new custom-format dump with
`pg_restore --list` before accepting user data. These local backups protect
against application mistakes. Install `surgeindex-postgres-backup-offsite` and
`surgeindex-postgres-backup-verify` with the matching service/timer units,
create `/etc/surgeindex/backup.env` from
`surgeindex-backup.env.example`, and store the age identity as a root-only
file. The offsite job encrypts the custom-format dump before uploading it to
the configured S3-compatible bucket; the verification job downloads the
latest object, decrypts it, and runs `pg_restore --list`. Do not accept the
backup as operationally valid until both the upload and verification journals
show success. Restore only to an explicitly named disposable database with
`CONFIRM_RESTORE=YES`; run migrations and readiness checks before any
promotion.

Install `surgeindex-traffic-aggregation.service` and its timer plus
`surgeindex-scoring.service` and its timer under `/etc/systemd/system`. Enable
both timers, run each service once, and check its journal before accepting live
tracker traffic. The traffic job expires inactive sessions and refreshes live
counts every minute. The scoring job uses its database-backed idempotency slots
to refresh baselines, scores, breakouts, and rankings every five minutes.

Do not enable the HiGuppy revenue timer during Public Free. It belongs to a
separate revenue-board release and must remain disabled together with Stripe,
Boost, GA4, and the public revenue board. When that later release is approved,
the timer posts only confirmed WooCommerce totals to `/api/internal/revenue`;
cancelled and on-hold orders are excluded. Stripe Boost revenue remains
separate from organic Heat Score and rank.
