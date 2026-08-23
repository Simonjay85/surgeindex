# Baseline engine

Baselines describe what is normal for one site. They are not a global popularity average.

## Selection order

For a scoring time, the engine selects accepted hourly observations in this order:

1. Same weekday and hour.
2. Same hour across the lookback window.
3. Recent rolling observations.

If none has enough observations, the site remains `building_baseline` and no calibrated public score is fabricated.

## Robust statistics

The expected visitor level is the median. The spread uses median absolute deviation with a bounded floor and relative floor. A single viral spike therefore cannot permanently redefine normal. The baseline stores lower/upper bounds, typical active users, sample count, lookback, confidence, completeness, method, and score version.

`baseline_bucket` preserves normalized hourly observations for audit and backfill. `site_baseline` is the queryable current summary. Both writes are idempotent on site/time or site identity.

## Freshness and history

Stale source data changes eligibility and confidence but does not delete history. A recovered source can regain a fresh state after accepted data resumes; no permanent outage penalty is carried forward.
