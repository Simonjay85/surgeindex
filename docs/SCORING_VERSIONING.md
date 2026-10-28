# Scoring versioning

`heat-v1` is stored in `scoring_config` and persisted on each `site_score`, `current_ranking`, and `rank_snapshot` row. The configuration stores weights, baseline, eligibility, league, smoothing, and breakout settings in typed JSON columns alongside the queryable release/version fields.

Score records are immutable calculation slots upserted by the idempotent slot key. Recalculation updates the same slot for the same version; it does not delete older versions. A new release should create a new config/version, run bounded backfill tooling, compare distributions, and publish only after verification.

The local backfill command supports a dry-run plan, optional site filter, ISO date bounds, batch-size validation, and resume-safe job keys. The current runner is intentionally conservative: it publishes versioned current evidence and never silently overwrites historical versions.
