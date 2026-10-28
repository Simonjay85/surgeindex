import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServerEnv } from "@surge/config";
import { AppShell } from "../../../components/app-shell";
import { AuthForm } from "../../../components/auth-form";
import { safeInternalPath } from "../../../lib/utils";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string }> }) {
  const params = await searchParams;
  const env = getServerEnv();
  return <AppShell><div className="container page-hero"><Link className="text-link" href="/"><ArrowLeft size={14} /> Back to SurgeIndex</Link><div className="section-tight" style={{ maxWidth: 540, margin: "0 auto" }}><AuthForm isDemo={env.APP_MODE === "demo"} initialMode={params.mode === "sign-up" ? "sign-up" : "sign-in"} nextPath={safeInternalPath(params.next)} googleEnabled={Boolean(env.GOOGLE_AUTH_CLIENT_ID && env.GOOGLE_AUTH_CLIENT_SECRET)} turnstileSiteKey={env.TURNSTILE_SITE_KEY} />{env.APP_MODE === "production" ? <div className="method-note" style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 16 }}><Link className="text-link" href="/auth/forgot-password">Forgot password?</Link><Link className="text-link" href="/auth/resend-verification">Resend verification</Link></div> : null}</div></div></AppShell>;
}
