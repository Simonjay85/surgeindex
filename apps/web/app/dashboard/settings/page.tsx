"use client";

import { useState } from "react";
import { Check, LockKeyhole, Save, UserRound } from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { DashboardShell, DashboardTopline, DemoNotice } from "../../../components/dashboard-shell";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  return <AppShell><DashboardShell active="/dashboard/settings"><DashboardTopline title="Settings" description="Workspace preferences and security boundaries." action={<button className="button button-coral" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800); }}>{saved ? <Check size={15} /> : <Save size={15} />} {saved ? "Saved" : "Save changes"}</button>} /><DemoNotice>Settings are local to this demo workspace.</DemoNotice><div className="section-tight"><div className="profile-columns"><div className="panel"><div className="panel-heading"><div><h2>Profile</h2><p>Account details shown in owner notifications.</p></div><UserRound size={17} /></div><div className="form-grid"><label className="field-label">Name<input defaultValue="Aaron Nguyen" /></label><label className="field-label">Email<input defaultValue="aaron@example.com" type="email" /></label></div></div><div className="panel"><div className="panel-heading"><div><h2>Privacy controls</h2><p>Choose how the demo tracker behaves.</p></div><LockKeyhole size={17} /></div><div className="toggle-row"><div><strong>Do Not Track</strong><span className="dashboard-list-row" style={{ padding: 0, border: 0 }}>Respect browser preference</span></div><button className="toggle toggle-on" aria-label="Do Not Track enabled"><span /></button></div><div className="toggle-row"><div><strong>Product updates</strong><span className="dashboard-list-row" style={{ padding: 0, border: 0 }}>Useful notes about measurement</span></div><button className="toggle" aria-label="Product updates disabled"><span /></button></div></div></div></div></DashboardShell></AppShell>;
}
