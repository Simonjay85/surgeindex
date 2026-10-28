import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@surge/config";
import { getTrustedClientIp } from "./client-ip";

type TokenKind = "impression" | "click";

export interface ImpressionTokenPayload {
  v: 1;
  kind: "impression";
  campaignId: string;
  siteId: string;
  placementKey: string;
  creativeVersion: number;
  visitorContextHash: string;
  routeContext: string | null;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export interface ClickTokenPayload {
  v: 1;
  kind: "click";
  campaignId: string;
  siteId: string;
  siteSlug: string;
  placementKey: string;
  creativeVersion: number;
  visitorContextHash: string;
  destinationUrl: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

function tokenSecret(): string {
  const env = getServerEnv();
  if (env.APP_MODE === "demo") return "surgeindex-demo-boost-token-fixture-v1";
  const secret = env.TRACKER_SIGNING_SECRET ?? env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("boost_token_secret_unavailable");
  return secret;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signEncoded(encoded: string): string {
  return createHmac("sha256", tokenSecret()).update(encoded).digest("base64url");
}

function sign(kind: TokenKind, payload: object): string {
  const encoded = encode(payload);
  return `${kind}.${encoded}.${signEncoded(encoded)}`;
}

function verify<T extends { v: 1; kind: TokenKind; issuedAt: number; expiresAt: number }>(token: string, kind: TokenKind): T | null {
  const [tokenKind, encoded, signature] = token.split(".");
  if (tokenKind !== kind || !encoded || !signature) return null;
  const expected = signEncoded(encoded);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
    if (parsed.v !== 1 || parsed.kind !== kind || !Number.isFinite(parsed.issuedAt) || !Number.isFinite(parsed.expiresAt)) return null;
    if (parsed.issuedAt > Date.now() + 60_000 || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signImpressionToken(input: Omit<ImpressionTokenPayload, "v" | "kind" | "nonce">): string {
  return sign("impression", { ...input, v: 1, kind: "impression", nonce: randomBytes(16).toString("hex") });
}

export function verifyImpressionToken(token: string): ImpressionTokenPayload | null {
  return verify<ImpressionTokenPayload>(token, "impression");
}

export function signClickToken(input: Omit<ClickTokenPayload, "v" | "kind" | "nonce">): string {
  return sign("click", { ...input, v: 1, kind: "click", nonce: randomBytes(16).toString("hex") });
}

export function verifyClickToken(token: string): ClickTokenPayload | null {
  return verify<ClickTokenPayload>(token, "click");
}

export function hashBoostToken(token: string): string {
  return createHmac("sha256", tokenSecret()).update(`boost-token:${token}`).digest("hex");
}

export function anonymousVisitorHash(request: Request, siteId: string): string {
  const env = getServerEnv();
  const secret = env.TRACKER_HASH_SECRET ?? env.TRACKER_HASH_SALT ?? env.TRACKER_SIGNING_SECRET ?? tokenSecret();
  const visitorId = request.headers.get("x-surgeindex-visitor")?.trim().slice(0, 128)
    ?? request.headers.get("cookie")?.match(/(?:^|;\s*)si_vid=([^;]+)/)?.[1]?.slice(0, 128)
    ?? "anonymous";
  const trustedClientIp = getTrustedClientIp(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 256) ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", `${secret}:${day}`).update(`${siteId}:${visitorId}:${trustedClientIp}:${userAgent}`).digest("hex");
}

export function routeContext(request: Request): string {
  try {
    return new URL(request.url).pathname.slice(0, 512) || "/";
  } catch {
    return "/";
  }
}
