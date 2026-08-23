import { createHash, randomBytes } from "node:crypto";

export const GA4_READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  prompt?: "consent" | "select_account";
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GA4_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.prompt) url.searchParams.set("prompt", input.prompt);
  return url.toString();
}

export function parseGrantedScopes(scope: string | string[] | undefined): string[] {
  const values = Array.isArray(scope) ? scope : (scope ?? "").split(/[\s,]+/);
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function hasReadOnlyAnalyticsScope(scopes: string[]): boolean {
  return scopes.includes(GA4_READONLY_SCOPE) && !scopes.some((scope) => scope.endsWith("analytics.edit"));
}
