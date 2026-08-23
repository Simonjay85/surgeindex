# Heat Score v1

Heat Score is a deterministic 0–100 organic-attention signal. It is calculated from accepted traffic aggregates and source-quality facts. Payment, boost, sponsorship, impression, and campaign fields are not inputs.

## Components

| Component | Weight | Treatment |
| --- | ---: | --- |
| Growth velocity | 35% | Relative lift plus absolute lift and baseline support. Log transforms control small bases. |
| Live acceleration | 25% | Active visitors versus the site’s typical active level where the source supports it. |
| Traffic volume | 20% | Log-normalized accepted 24-hour visitor volume. |
| Engagement quality | 10% | Engagement rate and/or visible engagement duration. Missing metrics are explicit. |
| Trust and confidence | 10% | Verification source, ownership separation, freshness, baseline confidence, and completeness. |

The score stores `rawScore`, `smoothedScore`, and `displayedScore`. Smoothing reduces noisy oscillation; state caps protect provisional and stale records. The stored score record also includes version, calculation window/slot, baseline reference, typed components, penalties, reason codes, and confidence.

## Integrity rules

- Unverified traffic cannot earn verified volume or live credit.
- Suspected, invalid, duplicate, replay, and fraud-review traffic is excluded upstream or moves the score into a restricted state.
- A missing metric is not fabricated. It receives an explicit neutral treatment and lower confidence where appropriate.
- A paid boost can change distribution, never this score or organic rank.

`heat-v1` is the active version. Formula changes require a new version and a retained audit trail for old versions.
