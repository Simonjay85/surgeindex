import { getServerEnv } from "@surge/config";
import { AppShell } from "../../../components/app-shell";
import { ResendVerificationForm } from "../../../components/password-recovery-form";

export const metadata = { title: "Resend verification" };

export default function ResendVerificationPage() {
  const env = getServerEnv();
  return <AppShell><div className="container page-hero"><div className="section-tight" style={{ maxWidth: 540, margin: "0 auto" }}><ResendVerificationForm turnstileSiteKey={env.TURNSTILE_SITE_KEY} /></div></div></AppShell>;
}
