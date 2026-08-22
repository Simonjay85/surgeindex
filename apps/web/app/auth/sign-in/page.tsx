import Link from "next/link";
import { ArrowLeft, Check, LockKeyhole, Signal } from "lucide-react";
import { AppShell } from "../../../components/app-shell";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return <AppShell><div className="container page-hero"><Link className="text-link" href="/"><ArrowLeft size={14} /> Back to SurgeIndex</Link><div className="section-tight" style={{ maxWidth: 540, margin: "0 auto" }}><div className="panel" style={{ padding: 31 }}><div className="brand"><span className="brand-mark"><Signal size={17} /></span><span>SurgeIndex</span></div><h1 style={{ fontSize: 45, marginTop: 25 }}>Welcome back.</h1><p style={{ color: "var(--foreground-muted)" }}>Demo access takes you straight to the owner dashboard. Production adds Better Auth email and Google sign-in here.</p><div className="dashboard-alert" style={{ marginTop: 19 }}><LockKeyhole size={16} /><span>This preview does not create a real session or collect credentials.</span></div><Link className="button button-coral" style={{ width: "100%", marginTop: 20 }} href="/dashboard">Continue with demo workspace <Check size={16} /></Link><div className="method-note" style={{ marginTop: 19 }}>Production architecture: Better Auth, secure cookies, role checks for <strong>user</strong> and <strong>admin</strong>, and no secrets in client code.</div></div></div></div></AppShell>;
}
