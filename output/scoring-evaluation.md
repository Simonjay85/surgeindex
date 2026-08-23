# SurgeIndex scoring evaluation

- Score version: heat-v1
- Generated at: 2026-08-23T12:20:04.171Z
- Fixture: deterministic synthetic cases A–L

## Cases

| Case | State | League | Score | Freshness | Breakout first → persistent |
| --- | --- | --- | ---: | --- | --- |
| A · Tiny base spike | provisional | new | 35 | live | n/a |
| B · Large genuine surge | eligible | established | 79 | live | n/a |
| C · Large stable site | eligible | established | 61 | live | n/a |
| D · Low-volume stable site | eligible | emerging | 38 | live | none → n/a |
| E · Bot spike | fraud_review | established | 45 | live | none → n/a |
| F · Stale tracker | stale | established | 44 | stale | n/a |
| G · New legitimate site | building_baseline | new | 0 | live | n/a |
| H · Missing engagement support | eligible | established | 60 | live | n/a |
| I · Nearly tied sites | n/a | n/a | n/a | n/a | n/a |
| J · Sudden live acceleration | eligible | established | 73 | live | watch → surging |
| K · One-minute anomaly | n/a | n/a | n/a | n/a | watch → n/a |
| L · Recovery after data outage | stale | established | 44 | stale | n/a |

## Deterministic tie probe

Ordering: tie-a → tie-b.

## Local performance timings

| Sites | score loop (ms) | rank sort (ms) | breakout loop (ms) | environment |
| ---: | ---: | ---: | ---: | --- |
| 100 | 1.099 | 0.111 | 0.072 | darwin arm64, Node v25.9.0 |
| 1000 | 4.11 | 0.405 | 0.521 | darwin arm64, Node v25.9.0 |

## Limitations

- Synthetic fixtures test determinism and fairness invariants; they are not predictive validation.
- Performance timings are local process timings without PostgreSQL, Cloudflare, or Tinybird.
