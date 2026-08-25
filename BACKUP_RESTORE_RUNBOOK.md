# Backup and restore runbook

## Design

The primary backup is a PostgreSQL custom-format dump created by
`deploy/vps/surgeindex-postgres-backup`. It is written atomically under
`/var/backups/surgeindex/postgres` and retained locally for 14 days.

The offsite script creates a fresh dump from the `surgeindex-db` container,
encrypts it with age before it leaves the host, uploads the `.dump.age` object
to the configured S3-compatible destination, and retains a short local staging
window. The verification script downloads the latest encrypted object,
decrypts it with a root-only identity, and runs `pg_restore --list` without
connecting to a live database.

No dump, age private key, S3 credential, or provider token belongs in Git.

## Install on the VPS

Install scripts as root-owned mode `0750` under `/usr/local/sbin` and install
these units under `/etc/systemd/system`:

- `surgeindex-postgres-backup.service` / `.timer`
- `surgeindex-postgres-backup-offsite.service` / `.timer`
- `surgeindex-postgres-backup-verify.service` / `.timer`

Create `/etc/surgeindex/backup.env` from
`deploy/vps/surgeindex-backup.env.example`, populate it through the host secret
manager, and set mode `0600`. Store the age identity at the path named by
`BACKUP_AGE_IDENTITY_FILE`, also mode `0600`, readable only by root. Confirm
the age recipient and identity correspond before enabling the timer.

```bash
sudo install -o root -g root -m 0750 deploy/vps/surgeindex-postgres-backup /usr/local/sbin/
sudo install -o root -g root -m 0750 deploy/vps/surgeindex-postgres-backup-offsite /usr/local/sbin/
sudo install -o root -g root -m 0750 deploy/vps/surgeindex-postgres-backup-verify /usr/local/sbin/
sudo systemctl daemon-reload
sudo systemctl enable --now surgeindex-postgres-backup.timer
sudo systemctl enable --now surgeindex-postgres-backup-offsite.timer
sudo systemctl enable --now surgeindex-postgres-backup-verify.timer
```

The backup services require Docker, `pg_dump`/`pg_restore`, `age`, and the AWS
CLI (or compatible S3 CLI) to be installed on the host. Verify the journal
after the first run:

```bash
sudo systemctl start surgeindex-postgres-backup.service
sudo journalctl -u surgeindex-postgres-backup.service -n 100 --no-pager
sudo systemctl start surgeindex-postgres-backup-offsite.service
sudo journalctl -u surgeindex-postgres-backup-offsite.service -n 100 --no-pager
sudo systemctl start surgeindex-postgres-backup-verify.service
sudo journalctl -u surgeindex-postgres-backup-verify.service -n 100 --no-pager
```

Do not accept the backup as valid until the dump is non-zero, the offsite
upload succeeds, and verification reports `pg_restore --list` success.

## Deterministic disposable restore drill

The restore target must be a newly created, disposable database with a name
that is not production/live-named. Never point this command at the live
database or the production volume.

```bash
CONFIRM_RESTORE=YES \
BACKUP_FILE=/var/backups/surgeindex/offsite/surgeindex-<timestamp>.dump.age \
BACKUP_AGE_IDENTITY_FILE=/etc/surgeindex/backup.agekey \
RESTORE_DATABASE_URL="${RESTORE_DATABASE_URL:?set a disposable PostgreSQL URL in the shell}" \
/usr/local/sbin/surgeindex-postgres-restore
```

After restore:

1. Run `pnpm db:migrate` against the disposable target and verify the expected
   migration count.
2. Start a release artifact pointed at that target, call `/api/health/ready`,
   and verify all expected jobs/tables are readable.
3. Run read-only counts for sites, claims, tracker events, orders, processed
   webhooks, and `system_job_run`; do not export private payloads.
4. Record restore duration, backup timestamp, database size, migration count,
   readiness result, and any missing extension/role requirement.
5. Destroy the disposable database through the host's recoverable procedure
   after evidence is archived.

## Recovery targets and alerting

Set the approved RPO/RTO in the release ticket. The repository supplies the
mechanism but does not invent an operational target:

- RPO target: `PENDING OWNER APPROVAL`
- RTO target: `PENDING OWNER APPROVAL`
- Last successful offsite backup: read from timer journal/object metadata
- Last successful verification: read from verification journal

Alert on missing daily backup, offsite upload failure, verification failure,
disk headroom below the approved threshold, and restore-drill failure.
