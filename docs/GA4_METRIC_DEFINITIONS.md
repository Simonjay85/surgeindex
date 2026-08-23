# GA4 metric definitions

GA4 values are persisted with `source = ga4` and a provider definition version. They are not renamed to tracker concepts in public UI.

## Normalized Core concepts

| Internal concept | Google metric | Notes |
| --- | --- | --- |
| `active_users` | `activeUsers` | GA4 active users in the requested report window. Not tracker unique visitors. |
| `sessions` | `sessions` | GA4 sessions under the property configuration. |
| `screen_page_views` | `screenPageViews` | GA4 screen/page views; implementation and consent differences can make this differ from tracker pageviews. |
| `engaged_sessions` | `engagedSessions` | GA4 engaged sessions. |
| `engagement_rate` | `engagementRate` | Provider ratio, kept as a ratio rather than a tracker-derived value. |
| `average_session_duration` | `averageSessionDuration` | GA4 average session duration. |
| `user_engagement_duration` | `userEngagementDuration` | GA4 engagement duration when requested and supported. |
| `key_events` | `keyEvents` | Read-only report value; no key events are created or modified. |
| `event_count` | `eventCount` | Reported event count. |

Core rows are normalized by `date` or `dateHour` only after the provider response has supplied compatible headers. Unsupported metrics/dimensions produce a degraded or partial result instead of silently being substituted with tracker data.

## Required windows

The service supports yesterday and recent seven-day synchronization, with bounded historical backfill chunks. The schema supports 28/30/90-day snapshots for configured extensions. Closed historical days are not rewritten on every public request; they are reconciled by scheduled maintenance.

## Realtime definitions

Realtime is a separate report family. The implementation stores five-minute and thirty-minute snapshots with `recent_active_users`, screen/page views, event count, and key events. Public labels are explicit:

- `GA4 active users — last 5 minutes`
- `GA4 active users — last 30 minutes`

The label is never `Online Now` or `exact users online`. GA4 realtime active users are not tracker active visitors. A site with both sources shows source-specific values side by side and never adds them.

## Ranking use

One score uses one source bundle. If the primary source is GA4, the score consumes persisted GA4 Core aggregates and does not manufacture tracker `activeNow` from GA4 realtime. Paid/referral activity is outside this metric contract.
