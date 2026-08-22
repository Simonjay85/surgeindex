import "server-only";

import { headers as nextHeaders } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { and, eq } from "drizzle-orm";
import { account, getPostgresDb, session, user, verificationToken } from "@surge/db";
import { getServerEnv } from "@surge/config";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  isDemo: boolean;
}

const DEMO_USER: CurrentUser = {
  id: "demo-user",
  name: "Demo Workspace",
  email: "demo@surgeindex.local",
  role: "admin",
  isDemo: true,
};

function createAuth(env: ReturnType<typeof getServerEnv>) {
  const google = env.GOOGLE_AUTH_CLIENT_ID && env.GOOGLE_AUTH_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_AUTH_CLIENT_ID, clientSecret: env.GOOGLE_AUTH_CLIENT_SECRET } }
    : {};
  return betterAuth({
    database: drizzleAdapter(getPostgresDb(), {
      provider: "pg",
      schema: { user, session, account, verification: verificationToken },
      transaction: true,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL,
    basePath: "/api/auth",
    trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders: google,
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      },
    },
    plugins: [nextCookies()],
  });
}

let cachedAuth: ReturnType<typeof createAuth> | null = null;

export function getAuth(): ReturnType<typeof createAuth> {
  if (cachedAuth) return cachedAuth;
  const env = getServerEnv();
  if (env.APP_MODE !== "production" || env.DATA_PROVIDER !== "postgres") {
    throw new Error("Authentication is only available with APP_MODE=production and DATA_PROVIDER=postgres.");
  }
  cachedAuth = createAuth(env);
  return cachedAuth;
}

async function loadUser(userId: string): Promise<CurrentUser | null> {
  const db = getPostgresDb();
  const [record] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, isDemo: user.isDemo })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return record ?? null;
}

export async function getCurrentUser(request?: Request): Promise<CurrentUser | null> {
  const env = getServerEnv();
  if (env.APP_MODE === "demo") return DEMO_USER;
  const requestHeaders = request?.headers ?? (await nextHeaders());
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  if (!result?.user?.id) return null;
  return loadUser(result.user.id);
}

export async function revokeUserSessions(userId: string): Promise<void> {
  const db = getPostgresDb();
  await db.delete(session).where(and(eq(session.userId, userId)));
}

export function resetAuthForTests(): void {
  cachedAuth = null;
}
