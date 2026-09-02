import { describe, expect, it } from "vitest";
import {
  hashFanwardFixturePassword,
  verifyFanwardFixturePassword,
} from "../lib/server/fanward-staging-fixture-crypto";

describe("Fanward staging fixture credential hashing", () => {
  it("uses the Better Auth password format without retaining plaintext", async () => {
    const password = "FixtureCredential_1234567890";
    const hash = await hashFanwardFixturePassword(password);
    expect(hash).not.toBe(password);
    expect(hash).not.toContain(password);
    await expect(verifyFanwardFixturePassword(password, hash)).resolves.toBe(true);
    await expect(verifyFanwardFixturePassword("DifferentCredential_123456", hash)).resolves.toBe(false);
  });
});
