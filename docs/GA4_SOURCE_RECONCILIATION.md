# GA4 and tracker source reconciliation

Tracker and GA4 are approved but distinct traffic sources. They are not two counters to be added together.

## Source policy

`site_metric_source_policy` stores exactly one primary ranking source plus:

- source/version start time;
- lock-until time;
- previous source;
- transition reason;
- provisional overlap period; and
- baseline compatibility status.

Connecting GA4 creates or preserves a default tracker policy. It does not silently change a score.

## Metric isolation

Each aggregate includes site, connection, source, metric, window, bucket, freshness, confidence, and provider definition version. Baseline buckets are unique by site, source, and timestamp so a GA4 migration cannot overwrite the tracker observation at the same time bucket.

The score engine selects one source-specific bundle. It never computes `tracker visitors + GA4 active users`, and it does not reinterpret GA4 realtime as tracker `activeNow`. The owner comparison endpoint shows tracker 24-hour values and GA4 24-hour report values side by side with a definition note.

## Source transitions

Changing the primary source requires an authenticated owner action through the source transition route, a reason, a successful GA4 health/report check when switching to GA4, a lock period, a provisional overlap period, and a persisted transition audit row. A second switch during the lock is rejected. The score and rank rows persist source and provider-definition version so history remains interpretable.

After a switch, the baseline job uses only observations from the selected source and records compatibility/provisional state. Historical scores are not deleted when GA4 disconnects; ranking eligibility is removed and future sync stops.

## Public language

Public surfaces use labels such as `GA4 Verified`, `GA4 active users — last 30 minutes`, `Tracker Measured`, `Current ranking source: GA4`, and `Supporting source: Tracker`. Methodology explains that analytics systems can differ because of implementation, consent, blocking, attribution, and time-zone definitions.
