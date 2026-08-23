# GA4 property and web-stream selection

Property discovery is performed after OAuth has completed and before a traffic source is activated.

## Discovery contract

The provider lists Analytics account summaries and properties through the Analytics Admin API. Results are normalized into internal account/property types before persistence or rendering. The owner dashboard can search the bounded result set by account name, property name, or property resource ID. The service pages provider results and caps the browser-facing list with `GA4_MAX_PROPERTIES_PER_USER`.

For each property the UI can show:

- account display name;
- property display name and resource ID;
- property type when available;
- time zone and currency;
- web stream display name and resource ID;
- stream default URI;
- Measurement ID when returned; and
- the computed domain-match state.

Android and iOS streams are retained by the normalized provider layer but are filtered from website selection in this batch.

## Domain matching

`packages/ga4/src/domain.ts` normalizes scheme, default ports, case, trailing dots, `www`, and internationalized hostnames. A stream is not accepted because its property name, account name, Measurement ID, or a user-entered label looks plausible.

The current automatic activation policy accepts only:

- `exact`, for the canonical host;
- `www_equivalent`, for the canonical host and its `www` form.

`approved_subdomain` and `approved_alias` are represented as explicit states for a future or admin-approved policy. An arbitrary subdomain is a mismatch and blocks automatic activation. The selected stream is fetched again during test/selection, so a client cannot authorize a property by ID alone.

## Activation gate

Property selection does not mean traffic is verified. The server must confirm all of the following:

1. the requester can manage the SurgeIndex site;
2. the OAuth grant can read the selected property;
3. the selected resource is a web stream;
4. the normalized stream URI matches the canonical domain under the active policy; and
5. a supported lightweight Core report succeeds.

Only then is the connection moved to `connected`, the successful report is recorded, and initial backfill/sync jobs are queued. A tracker verification status is not overwritten by a GA4 connection.
