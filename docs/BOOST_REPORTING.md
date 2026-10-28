# Boost reporting

Owner reports keep these stages separate:

- ad opportunities
- rendered impressions
- qualified impressions
- invalid/suspected/duplicate impressions
- clicks, valid clicks, and unique clicks
- attributed visits and attributed engaged visits

CTR uses valid clicks divided by qualified impressions. Click-to-visit and visit-to-engaged rates use only non-zero, confirmed denominators. Cost metrics use integer minor currency units and are `Not available` when attribution or another denominator is unavailable; the UI never substitutes `$0.00` for missing data.

Each report labels the data source: SurgeIndex ad delivery, SurgeIndex click redirect, destination tracker attribution, and Stripe payment. Historical aggregates remain when a campaign is paused, cancelled, refunded, disputed, or underdelivered. Reports are not promises of clicks, conversions, sales, or inventory certainty.
