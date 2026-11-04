# Privacy and traffic data flow

## Flow

    Browser tracker
      -> bounded JSON collector
      -> validation, origin check, keyed hashing, anti-fraud decision
      -> local queue or Cloudflare Queue
      -> Postgres or Tinybird event provider
      -> aggregate current/snapshot tables
      -> owner/public server endpoints

Realtime valid signals also go to the local registry or the site-level Durable Object. WebSocket clients receive counts only; connecting to a public live page never creates visitor presence.

## Browser collection

The tracker is first-party and site-scoped. It stores an anonymous visitor ID in local storage for the documented rotation period and a session ID in session storage. It does not use cross-site identifiers, cookies set by SurgeIndex, fingerprinting, form inspection, page text, names, email addresses, document titles, or full IP addresses.

It sends pathname only, strips query strings and fragments, sends only the referrer hostname, pauses heartbeats while hidden, supports explicit opt-out, and supports consent-required mode. session_end is best effort and is never needed for expiry correctness.

## Server handling

The collector:

1. Enforces content type, body size, and batch size.
2. Validates the public schema.
3. Resolves the public key without exposing internal IDs.
4. Checks key state, site state, and reported origin.
5. Normalizes path/referrer/device fields.
6. Assigns a trusted received timestamp.
7. HMAC-hashes visitor/session IDs and IP-derived rate-limit signals.
8. Stores no raw IP or raw browser identifiers.
9. Records the fraud decision and reason codes without rewriting the evidence.

The hash secret is rotated by configured server-side rotation buckets. Retention is bounded by EVENT_RETENTION_DAYS and is enforced by the aggregation/retention job. Aggregates and snapshots are retained separately so public metrics do not require unrestricted raw-event retention.

## Access boundaries

Public endpoints return aggregates, source labels, freshness, and public identifiers only. Owner endpoints require a session and an ownership relation. Tracker-key generation, rotation, revocation, and installation tests require an ownership-verified active site. Internal queue and aggregation endpoints require a service bearer token.

Origin checking is a useful browser signal, not proof of human traffic. Non-browser clients can forge Origin headers, so origin checks are combined with key state, rate limits, schema validation, replay protection, and behavioural signals.
