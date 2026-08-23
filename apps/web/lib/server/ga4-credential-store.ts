import "server-only";

import { eq } from "drizzle-orm";
import { gaConnection, gaCredential, getPostgresDb, type PostgresDatabase } from "@surge/db";
import type { Ga4CredentialRecord, Ga4CredentialStore } from "@surge/ga4";
import { decryptGa4Secret, encryptGa4Secret, TokenDecryptionError } from "./ga4-token-crypto";

function aad(connectionId: string, kind: "refresh" | "access"): string {
  return `ga4:credential:${connectionId}:${kind}`;
}

export class PostgresGa4CredentialStore implements Ga4CredentialStore {
  constructor(private readonly db: PostgresDatabase = getPostgresDb()) {}

  async getCredential(connectionId: string): Promise<Ga4CredentialRecord | null> {
    const [row] = await this.db
      .select({ connection: gaConnection, credential: gaCredential })
      .from(gaConnection)
      .leftJoin(gaCredential, eq(gaCredential.connectionId, gaConnection.id))
      .where(eq(gaConnection.id, connectionId))
      .limit(1);
    if (!row?.credential?.encryptedRefreshToken) return null;
    try {
      return {
        connectionId,
        refreshToken: decryptGa4Secret(row.credential.encryptedRefreshToken, aad(connectionId, "refresh")),
        accessToken: row.credential.encryptedAccessToken ? decryptGa4Secret(row.credential.encryptedAccessToken, aad(connectionId, "access")) : null,
        accessTokenExpiresAt: row.credential.accessTokenExpiresAt,
        grantedScopes: row.credential.grantedScopes,
        googleSubject: row.credential.googleSubject,
        grantIdentity: row.credential.grantIdentity,
      };
    } catch (error) {
      if (error instanceof TokenDecryptionError) {
        await this.markReauthorizationRequired(connectionId, "token_decryption_failed");
        return null;
      }
      throw error;
    }
  }

  async saveAccessToken(connectionId: string, accessToken: string, expiresAt: Date): Promise<void> {
    const encrypted = encryptGa4Secret(accessToken, aad(connectionId, "access"));
    const now = new Date();
    await this.db
      .insert(gaCredential)
      .values({ connectionId, encryptedAccessToken: encrypted.envelope, accessTokenKeyVersion: encrypted.keyVersion, encryptionKeyVersion: encrypted.keyVersion, tokenCreatedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: gaCredential.connectionId,
        set: { encryptedAccessToken: encrypted.envelope, accessTokenKeyVersion: encrypted.keyVersion, accessTokenExpiresAt: expiresAt, updatedAt: now },
      });
  }

  async saveRefreshToken(connectionId: string, refreshToken: string, scopes: string[], googleSubject: string | null, grantIdentity: string | null): Promise<void> {
    const encrypted = encryptGa4Secret(refreshToken, aad(connectionId, "refresh"));
    const now = new Date();
    await this.db
      .insert(gaCredential)
      .values({ connectionId, encryptedRefreshToken: encrypted.envelope, encryptionKeyVersion: encrypted.keyVersion, grantedScopes: scopes, googleSubject, grantIdentity, tokenCreatedAt: now, updatedAt: now, revokedAt: null })
      .onConflictDoUpdate({
        target: gaCredential.connectionId,
        set: { encryptedRefreshToken: encrypted.envelope, encryptionKeyVersion: encrypted.keyVersion, grantedScopes: scopes, googleSubject, grantIdentity, revokedAt: null, updatedAt: now },
      });
  }

  async recordRefreshSuccess(connectionId: string, at: Date): Promise<void> {
    await this.db.update(gaCredential).set({ lastSuccessfulRefresh: at, lastRefreshFailure: null, updatedAt: at }).where(eq(gaCredential.connectionId, connectionId));
    await this.db.update(gaConnection).set({ lastRefreshAt: at, lastRefreshFailure: null, lastError: null, updatedAt: at }).where(eq(gaConnection.id, connectionId));
  }

  async recordRefreshFailure(connectionId: string, code: string, at: Date): Promise<void> {
    await this.db.update(gaCredential).set({ lastRefreshFailure: at, updatedAt: at }).where(eq(gaCredential.connectionId, connectionId));
    await this.db.update(gaConnection).set({ lastRefreshFailure: code, lastError: code, updatedAt: at }).where(eq(gaConnection.id, connectionId));
  }

  async markReauthorizationRequired(connectionId: string, code: string): Promise<void> {
    await this.db.update(gaConnection).set({ connectionState: "reauthorization_required", rankingEligible: false, lastError: code, updatedAt: new Date() }).where(eq(gaConnection.id, connectionId));
  }

  async markRevoked(connectionId: string, at: Date): Promise<void> {
    await this.db.update(gaCredential).set({ encryptedRefreshToken: null, encryptedAccessToken: null, accessTokenKeyVersion: null, accessTokenExpiresAt: null, revokedAt: at, updatedAt: at }).where(eq(gaCredential.connectionId, connectionId));
    await this.db.update(gaConnection).set({ connectionState: "revoked", status: "disconnected", rankingEligible: false, revokedAt: at, updatedAt: at }).where(eq(gaConnection.id, connectionId));
  }

  async destroy(connectionId: string): Promise<void> {
    await this.db.delete(gaCredential).where(eq(gaCredential.connectionId, connectionId));
  }

  async saveInitial(input: { connectionId: string; refreshToken: string | null; accessToken: string; accessTokenExpiresAt: Date; scopes: string[]; googleSubject: string | null; grantIdentity: string | null }): Promise<void> {
    await this.saveAccessToken(input.connectionId, input.accessToken, input.accessTokenExpiresAt);
    if (input.refreshToken) await this.saveRefreshToken(input.connectionId, input.refreshToken, input.scopes, input.googleSubject, input.grantIdentity);
    else {
      await this.db.update(gaCredential).set({ grantedScopes: input.scopes, googleSubject: input.googleSubject, grantIdentity: input.grantIdentity, updatedAt: new Date() }).where(eq(gaCredential.connectionId, input.connectionId));
    }
  }
}

export function createGa4CredentialStore(db: PostgresDatabase = getPostgresDb()): PostgresGa4CredentialStore {
  return new PostgresGa4CredentialStore(db);
}
