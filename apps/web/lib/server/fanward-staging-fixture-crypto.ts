import { hashPassword, verifyPassword } from "better-auth/crypto";

/** Server-only adapter used by the staging fixture command; never logs secrets. */
export async function hashFanwardFixturePassword(password: string): Promise<string> {
  return hashPassword(password);
}

export async function verifyFanwardFixturePassword(password: string, hash: string): Promise<boolean> {
  return verifyPassword({ password, hash });
}
