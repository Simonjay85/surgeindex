# SurgeIndex VPS deployment

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
- database backup timer: `surgeindex-postgres-backup.timer`
- local backup retention: 14 days under `/var/backups/surgeindex/postgres`
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
against application mistakes; add encrypted off-host replication for host or
disk failure recovery.

Install `surgeindex-traffic-aggregation.service` and its timer plus
`surgeindex-scoring.service` and its timer under `/etc/systemd/system`. Enable
both timers, run each service once, and check its journal before accepting live
tracker traffic. The traffic job expires inactive sessions and refreshes live
counts every minute. The scoring job uses its database-backed idempotency slots
to refresh baselines, scores, breakouts, and rankings every five minutes.
