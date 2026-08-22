# Tracker event schema

The public collector accepts a single event, an events array, or an object with an events array. The batch is bounded by TRACKER_EVENT_MAX_BATCH_SIZE and the request by TRACKER_EVENT_MAX_BODY_BYTES. Only the five event types below are accepted.

## Browser event fields

| Field | Type | Rule |
| --- | --- | --- |
| eventId | UUID | Client-generated identifier used for replay protection. |
| eventType | enum | pageview, session_start, heartbeat, engaged, or session_end. |
| siteKey | public string | Public tracker key; never an internal site ID. |
| visitorId | bounded identifier | Anonymous first-party ID; hashed immediately at the collector. |
| sessionId | bounded identifier | Tab/session ID; hashed immediately at the collector. |
| pathname | string | Path only; query and fragment are stripped and length is bounded. |
| referrerHost | hostname | Hostname only; full referrer URL is not accepted into storage. |
| occurredAt | ISO timestamp | Checked for skew; the server received timestamp is authoritative. |
| visible | boolean | Used as a validation signal and for active-session state; it is not trusted by itself. |
| engagedSeconds | integer | Present for engaged; validated and bounded server-side. |
| trackerVersion | short string | Version of the built tracker. |
| attributionToken | opaque string | Optional signed short-lived SurgeIndex referral token. |

The tracker never sends form values, page text, names, email addresses, document titles, full URLs, full IP addresses, browser fingerprints, or arbitrary custom event payloads.

## Normalized internal event

After validation, the collector creates:

    eventId, eventType, siteId, visitorHash, sessionHash, pathname, referrerHost,
    receivedAt, occurredAt, clientOccurredAt, visible, engagedSeconds,
    trackerVersion, attributionTokenHash, attributionClickId, trackerPublicKey,
    originHost, country, device, decision, fraudScore, fraudReasonCodes,
    fraudRuleVersion, collectorRequestId, isDemo

Raw visitorId, sessionId, raw IP, and raw attribution token are not included in this object. visitorHash, sessionHash, IP-derived rate-limit identifiers, and attributionTokenHash are keyed hashes that rotate with the server-side hash secret and rotation bucket.

## Collector response

The public response is intentionally small:

    { accepted: 3, rejected: 1, requestId: "..." }

Infrastructure details and exact fraud rules are not returned to the browser. Valid events may affect metrics. Suspected events are retained for review but excluded from public metrics. Invalid events are not included in normal aggregates.
