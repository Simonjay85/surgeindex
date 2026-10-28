import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getServerEnv } from "@surge/config";

export interface TokenKey {
  version: string;
  key: Buffer;
}

export class TokenDecryptionError extends Error {
  readonly code = "token_decryption_failed";

  constructor(message = "The encrypted GA4 credential could not be decrypted.") {
    super(message);
    this.name = "TokenDecryptionError";
  }
}

export function decodeTokenKey(value: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("GA4 token key must decode to exactly 32 bytes");
  return key;
}

export function encryptToken(plaintext: string, key: TokenKey, associatedData?: string): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty token");
  if (key.key.length !== 32) throw new Error("AES-256-GCM requires a 32-byte key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.key, iv);
  if (associatedData) cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [key.version, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(envelope: string, keys: TokenKey[], associatedData?: string): string {
  try {
    const [version, ivEncoded, tagEncoded, ciphertextEncoded] = envelope.split(".");
    if (!version || !ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("malformed");
    const key = keys.find((candidate) => candidate.version === version);
    if (!key || key.key.length !== 32) throw new Error("unknown_key_version");
    const decipher = createDecipheriv("aes-256-gcm", key.key, Buffer.from(ivEncoded, "base64url"));
    if (associatedData) decipher.setAAD(Buffer.from(associatedData, "utf8"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new TokenDecryptionError();
  }
}

export function getGa4TokenKeyRing(): { current: TokenKey; previous: TokenKey[] } {
  const env = getServerEnv();
  if (env.GA4_TOKEN_ENCRYPTION_KEY) {
    const current = { version: env.GA4_TOKEN_ENCRYPTION_KEY_VERSION, key: decodeTokenKey(env.GA4_TOKEN_ENCRYPTION_KEY) };
    const previous = env.GA4_TOKEN_ENCRYPTION_KEY_PREVIOUS && env.GA4_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION
      ? [{ version: env.GA4_TOKEN_ENCRYPTION_KEY_PREVIOUS_VERSION, key: decodeTokenKey(env.GA4_TOKEN_ENCRYPTION_KEY_PREVIOUS) }]
      : [];
    return { current, previous };
  }

  // Fixture mode has no real Google credential and may use a deterministic
  // development key derived from the local auth secret. Production cannot use
  // this path because config validation requires an explicit GA4 key.
  if (env.APP_MODE === "demo" && (env.GA4_PROVIDER_MODE === "fixture" || env.GA4_PROVIDER_MODE === "mock")) {
    const key = createHash("sha256").update(`surgeindex-ga4-fixture:${process.env.BETTER_AUTH_SECRET ?? "local-fixture"}`).digest();
    return { current: { version: "fixture-v1", key }, previous: [] };
  }
  throw new Error("GA4_TOKEN_ENCRYPTION_KEY is required for GA4 credentials");
}

export function encryptGa4Secret(plaintext: string, associatedData: string): { envelope: string; keyVersion: string } {
  const ring = getGa4TokenKeyRing();
  return { envelope: encryptToken(plaintext, ring.current, associatedData), keyVersion: ring.current.version };
}

export function decryptGa4Secret(envelope: string, associatedData: string): string {
  const ring = getGa4TokenKeyRing();
  return decryptToken(envelope, [ring.current, ...ring.previous], associatedData);
}

export function reencryptGa4Secret(envelope: string, associatedData: string): { envelope: string; keyVersion: string } {
  return encryptGa4Secret(decryptGa4Secret(envelope, associatedData), associatedData);
}
