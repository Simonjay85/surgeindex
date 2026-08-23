# Ranking eligibility

Score state is separate from score value. Public pages must show the state when evidence is incomplete.

| State | Public behavior |
| --- | --- |
| `unverified` | Listed metadata may remain visible; excluded from verified organic rank. |
| `building_baseline` | Appears in New where appropriate; no calibrated global rank. |
| `provisional` | Bounded score and league participation while history grows; score cap applies. |
| `eligible` | Fresh, sufficiently observed accepted traffic can enter global/category rank. |
| `stale` | Historical record remains; removed from misleading live rank and capped. |
| `suspended` | Excluded from organic scopes. |
| `fraud_review` | Excluded from organic and breakout scopes until resolved. |
| `ineligible` | Excluded until evidence or moderation state changes. |

Global ranking accepts eligible candidates. New and league views can expose early-stage records with their state label. Fraud-review, suspended, and ineligible records never become a public ranking shortcut.

Freshness is `live`, `fresh`, `delayed`, `stale`, or `offline`. Delayed data lowers confidence. Stale/offline data prevents a misleading live rank while preserving historical charts and score records.
