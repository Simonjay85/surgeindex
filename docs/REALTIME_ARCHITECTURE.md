# Realtime architecture

## Site-level state

Realtime state is coordinated per site with the key site/{siteId}. It never creates one Durable Object per browser. Each site object stores active hashed visitor IDs, session/tab IDs, last accepted heartbeat time, visibility, and expiry state.

The public primary metric is active visitors. Active sessions is a secondary metric and counts tabs/sessions. A second tab from the same visitor increases active sessions but does not increase active visitors.

## Providers

LOCAL uses the in-process localRealtimeRegistry. It is deterministic and suitable for local development and tests.

DURABLE_OBJECTS uses the RealtimeRoom Worker. The Collector sends valid signals asynchronously after queue admission to the site object using the shared `REALTIME_SIGNAL_TOKEN`; the object rejects unauthenticated `/signal` requests. The object persists a compact session map, schedules alarms for cleanup, broadcasts only when counts change, and throttles fanout. The public /snapshot route cleans expired state before responding.

Production configuration must explicitly select the provider and provide the realtime service URL plus Cloudflare credentials/bindings. The web app does not silently turn a missing Durable Object service into demo traffic.

## Client delivery

The Worker supports WebSocket clients at /ws and count snapshots at /snapshot. The web application uses a polling endpoint as a resilient fallback. The LiveMetric component reports connecting, live, stale, reconnecting, and offline states.

WebSocket connections are not visitor signals. A visitor is active only after valid tracker events and recent visible heartbeats. Hidden pages stop heartbeats and active state expires after ACTIVE_SESSION_TTL_SECONDS. session_end may remove a state early but cannot be required.
