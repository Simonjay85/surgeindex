# Traffic metric definitions

Batch 3 reports measured traffic only after the tracker event passes collector validation and the anti-fraud decision is valid. Demo values are a separate provider and are labelled as demo data.

## Identity and sessions

- Active visitor: one unique rotating visitor hash with at least one visible session whose accepted heartbeat is within ACTIVE_SESSION_TTL_SECONDS.
- Active session: one accepted session/tab with a recent visible heartbeat. Two tabs from one visitor count as one active visitor and two active sessions.
- Unique visitor: a distinct visitor hash with a valid pageview or session_start in the selected period.
- Session: a distinct session hash with a valid pageview or session_start in the selected period.
- Engaged session: a session with a valid engaged event and a validated engaged duration.
- Engagement rate: engaged sessions divided by sessions for the same window. It is null when there is no denominator.
- Average engagement duration: average validated engagedSeconds for valid engaged events; it is null when no valid engaged events exist.

Identifiers are deliberately rotating and site-scoped. They are not cross-site people identifiers.

## Windows

| Window | Meaning |
| --- | --- |
| Live | Current site realtime state, cleaned by heartbeat TTL. |
| Last 15 minutes | Recent operational realtime/traffic view. |
| Last 30 minutes | Recent active-session window used for activity snapshots. |
| 24 hours | Current dashboard counters and referral aggregates. |
| 7 days | Current visitors-7d counter. |
| 30/90 days | Snapshot/provider history only when the configured provider supplies it. |

The hourly snapshot table stores aggregate counts used by public charts. Public requests do not scan raw events for every page render.

## Referral metrics

- Outbound clicks: valid approved redirect clicks recorded by SurgeIndex.
- Valid clicks: clicks that pass redirect and click-quality checks.
- Unique clicks: clicks whose rotating visitor hash has no recent click for the site.
- Attributed visit: a valid destination pageview that presents a valid, unexpired, site-bound token created by a SurgeIndex click.
- Attributed engaged visit: an attributed visit whose session later produces a valid engaged event before the attribution record expires.

A click is never counted as a visit until the destination tracker confirms the landing event.

## Freshness and empty states

Freshness is based on the last accepted event, not a rejected or suspected request. A site without enough evidence shows Building baseline. Batch 3 does not fabricate Heat Score, growth percentage, breakout state, rank movement, or historical comparisons in production.
