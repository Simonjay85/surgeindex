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
after `TRUSTED_PROXY_MODE=direct_nginx` is explicitly set. If Cloudflare is
added, first allowlist Cloudflare's current published CIDRs in Nginx's
`real_ip` configuration, then use `TRUSTED_PROXY_MODE=cloudflare_nginx`.
Do not enable that mode with a blanket `set_real_ip_from 0.0.0.0/0` rule.

Include `nginx-http-hardening.conf` from the main `http{}` block. It provides
the anonymous `limit_req` zone used by the vhost. Confirm the effective config
with `sudo nginx -t` and `sudo nginx -T`.

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
- GA4 backfill timer: `surgeindex-ga4-backfill.timer`
- HiGuppy WooCommerce revenue timer: `surgeindex-higuppy-revenue.timer`
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

Production is deliberately fail-closed. Stripe and GA4 remain disabled until
their real provider credentials and operational requirements are supplied.
The first-party tracker may run through the local Postgres/queue/realtime path
on this single-process deployment when all three tracker secrets are present.

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

The HiGuppy revenue timer runs the WP-CLI-only aggregate bridge every five
minutes. It posts only confirmed WooCommerce totals to
`/api/internal/revenue`; cancelled and on-hold orders are excluded. Stripe
Boost revenue is read from settled live orders in the SurgeIndex ledger and is
never mixed into organic Heat Score or rank.
