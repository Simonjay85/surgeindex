"use client";

import { useState } from "react";
import { Check, LoaderCircle, LockKeyhole, Save, UserRound } from "lucide-react";

export function SettingsClient({ initialName, email, isDemo }: { initialName: string; email: string; isDemo: boolean }) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = await response.json().catch(() => null) as {
        data?: { name?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.data?.name) {
        setError(payload?.error?.message ?? "The profile could not be saved.");
        return;
      }
      setName(payload.data.name);
      setSavedName(payload.data.name);
      setMessage("Profile saved to your account.");
    } catch {
      setError("The profile request failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const unchanged = name.trim() === savedName;

  return (
    <div className="section-tight">
      {isDemo ? <div className="demo-ribbon dashboard-notice" role="status">Demo workspace settings are read-only and are not persisted.</div> : null}
      <div className="profile-columns">
        <form className="panel" onSubmit={saveProfile}>
          <div className="panel-heading">
            <div><h2>Profile</h2><p>Your persisted account details.</p></div>
            <UserRound size={17} />
          </div>
          <div className="form-grid">
            <label className="field-label">
              Name
              <input autoComplete="name" maxLength={100} minLength={1} onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
            <label className="field-label">
              Email
              <input disabled readOnly type="email" value={email} />
            </label>
          </div>
          <p className="method-note">{isDemo ? "Sign in to a production account to update this profile." : "Email changes stay locked until a verified-email workflow is configured."}</p>
          {message ? <div className="form-success"><Check size={15} /><p>{message}</p></div> : null}
          {error ? <p className="form-message form-error" role="alert">{error}</p> : null}
          <div className="panel-actions">
            <button className="button button-coral" disabled={isDemo || busy || unchanged || !name.trim()} type="submit">
              {busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}
              {busy ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>

        <div className="panel">
          <div className="panel-heading">
            <div><h2>Security</h2><p>Controls enforced by the production account boundary.</p></div>
            <LockKeyhole size={17} />
          </div>
          <div className="dashboard-list">
            <div className="dashboard-list-row">
              <div><strong>{isDemo ? "Demo access" : "Authenticated session"}</strong><span>{isDemo ? "No production session is created for the demo workspace." : "Protected by an HTTP-only, same-site cookie."}</span></div>
              <span className={`status-chip ${isDemo ? "status-scheduled" : "status-active"}`}>{isDemo ? "Preview" : "Active"}</span>
            </div>
            <div className="dashboard-list-row">
              <div><strong>Profile storage</strong><span>{isDemo ? "No changes are stored in demo mode." : "Name changes are written to the production account record."}</span></div>
              <span className={`status-chip ${isDemo ? "status-scheduled" : "status-active"}`}>{isDemo ? "Off" : "Postgres"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
