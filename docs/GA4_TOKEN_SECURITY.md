# GA4 token security

Refresh tokens are encrypted at rest with AES-256-GCM. Every envelope includes a key version, random 96-bit IV, authentication tag, and ciphertext:

`version.iv.tag.ciphertext`

The credential store is the only application boundary that decrypts a GA4 credential. Google provider calls receive a short-lived server-side token and no token is returned to browser routes or React components.

## Key versions and rotation

`GA4_TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes and is paired with `GA4_TOKEN_ENCRYPTION_KEY_VERSION`. A previous key/version pair can be configured during rotation. Existing envelopes remain readable through the key ring, and `reencryptGa4Secret` provides the migration primitive for rewriting an envelope under the current version.

OAuth PKCE verifiers use the same authenticated encryption boundary with transaction/site/state associated data. Credential ciphertext is bound to `ga4:credential:{connectionId}:{refresh|access}`; moving a ciphertext to another connection or purpose fails authentication.

## Failure handling

Malformed, tampered, unknown-version, or wrong-associated-data ciphertext raises `TokenDecryptionError`. The store marks the connection `reauthorization_required`, preserves analytics history, and does not retry decryption indefinitely. Revocation destroys the credential row/secret while preserving non-sensitive aggregates and reports.

The application does not log access tokens, refresh tokens, authorization codes, client secrets, card data, or raw provider payloads. Production configuration rejects fixture credentials and missing GA4 encryption secrets when GA4 is enabled.
