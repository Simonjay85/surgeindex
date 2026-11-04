# GA4 operations

## Owner operations

The owner dashboard at `/dashboard/sites/{siteId}/ga4` supports connection, property/stream selection, test report, status, manual Core/Realtime sync, backfill queueing, reauthorization, and local disconnect. It shows property/stream identity, measurement ID, report freshness, actual backfill progress, quota state, and ranking-source status.

Disconnect from SurgeIndex and revoke Google access are separate actions:

- local disconnect stops jobs, marks the connection disconnected, removes ranking eligibility, deletes stored credentials, and retains imported history;
- revoke calls Google’s revocation endpoint first, then marks the grant revoked and destroys local credentials.

The UI does not claim Google access was revoked after a local disconnect.

## Admin operations

The protected `/admin/ga4` view lists connection states, reauthorization-required rows, quota-limited properties, failed/backfill work, ranking eligibility, and encryption key versions. It does not expose plaintext tokens. Source transitions, provider errors, domain validation, refresh failures, and disconnect/revoke events are available through server activity/audit records and structured logs.

## Recovery playbooks

- `reauthorization_required`: reconnect the owner grant; preserve existing aggregates; do not delete history.
- `quota_limited`: keep the last valid snapshot, lower freshness/confidence as thresholds are crossed, and allow the next scheduled retry.
- `degraded`: inspect the sync run error code and retry the specific Core/Realtime job; avoid duplicate broad retries.
- partial backfill: rerun the bounded backfill command; checkpointed days are idempotent.
- domain mismatch: do not activate automatically; verify canonical domain/alias policy before any admin approval.
- key decryption failure: confirm key version/secret rotation, mark for reauthorization if the envelope cannot be recovered, and retain history.

## Deployment boundary

The repository includes local jobs and Cloudflare/OpenNext seams but does not provision a production scheduler, Google OAuth client, secret manager, quota alert sink, or live credentials. Those are explicit launch tasks. Run the fixture command in CI; run sync/backfill/health commands only with a real Postgres environment and approved Google credentials.
