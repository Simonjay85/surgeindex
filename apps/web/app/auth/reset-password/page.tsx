import { AppShell } from "../../../components/app-shell";
import { ResetPasswordForm } from "../../../components/password-recovery-form";
import { getServerEnv } from "@surge/config";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const env = getServerEnv();
  return <AppShell><div className="container page-hero"><div className="section-tight" style={{ maxWidth: 540, margin: "0 auto" }}><ResetPasswordForm token={params.token} turnstileSiteKey={env.TURNSTILE_SITE_KEY} /></div></div></AppShell>;
}
