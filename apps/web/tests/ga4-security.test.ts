import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, TokenDecryptionError } from "../lib/server/ga4-token-crypto";

const current = { version: "v2", key: Buffer.alloc(32, 2) };
const previous = { version: "v1", key: Buffer.alloc(32, 1) };

describe("GA4 token encryption", () => {
  it("uses authenticated encryption and binds ciphertext to its connection", () => {
    const envelope = encryptToken("refresh-token-fixture", current, "ga4:credential:connection:refresh");
    expect(decryptToken(envelope, [current], "ga4:credential:connection:refresh")).toBe("refresh-token-fixture");
    expect(() => decryptToken(envelope, [current], "ga4:credential:other:refresh")).toThrow(TokenDecryptionError);
  });

  it("decrypts a previous key version for rotation and rejects tampering", () => {
    const oldEnvelope = encryptToken("old-token", previous, "ga4:credential:connection:refresh");
    expect(decryptToken(oldEnvelope, [current, previous], "ga4:credential:connection:refresh")).toBe("old-token");
    const parts = oldEnvelope.split(".");
    const ciphertext = Buffer.from(parts[3] ?? "", "base64url");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    parts[3] = ciphertext.toString("base64url");
    const tampered = parts.join(".");
    expect(() => decryptToken(tampered, [current, previous], "ga4:credential:connection:refresh")).toThrow(TokenDecryptionError);
  });
});
