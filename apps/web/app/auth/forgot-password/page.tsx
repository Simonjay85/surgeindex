import { getServerEnv } from "@surge/config";
import { AppShell } from "../../../components/app-shell";
import { ForgotPasswordForm } from "../../../components/password-recovery-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  const env = getServerEnv();
  return <AppShell><div className="container page-hero"><div className="section-tight" style={{ maxWidth: 540, margin: "0 auto" }}><ForgotPasswordForm turnstileSiteKey={env.TURNSTILE_SITE_KEY} /></div></div></AppShell>;
}
