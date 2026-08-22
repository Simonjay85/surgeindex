import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";
import { AppShell } from "../components/app-shell";

export default function NotFound() {
  return <AppShell><main className="container page-hero"><div className="empty-state"><Radar size={32} color="#ef7359" /><div className="eyebrow">SIGNAL NOT FOUND</div><h1>This page fell off the board.</h1><p>The URL is real enough to be interesting, but SurgeIndex does not have a live record for it yet.</p><Link className="button button-dark" href="/">Back to live rankings <ArrowRight size={16} /></Link></div></main></AppShell>;
}
