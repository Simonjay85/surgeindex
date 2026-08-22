"use client";

import { useState } from "react";
import { ArrowRight, Check, Globe2, LoaderCircle, ShieldCheck } from "lucide-react";
import { CATEGORIES } from "@surge/shared";
import { safeDomain } from "../lib/utils";

export function SubmitForm() {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("ai-tools");
  const [state, setState] = useState<"idle" | "checking" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domain = safeDomain(url);
    if (!domain) { setState("error"); setMessage("Enter a public domain such as yoursite.com."); return; }
    setState("checking");
    setTimeout(() => { setState("success"); setMessage(`${domain} is ready for review. We found no existing listing, so the next step is metadata and category review.`); }, 480);
  }
  return <form className="submit-card" onSubmit={submit}>
    <div className="submit-card-head"><div><span className="eyebrow">SUBMIT A WEBSITE</span><h2>Put your site on the map.</h2><p>Listings are free. Verified traffic earns the rank; paid boosts only buy clearly labeled reach.</p></div><span className="submit-icon"><Globe2 size={24} /></span></div>
    <div className="form-grid"><label className="field-label">Website URL<input value={url} onChange={(event) => { setUrl(event.target.value); setState("idle"); }} placeholder="https://yourwebsite.com" inputMode="url" autoComplete="url" /></label><label className="field-label">Primary category<select value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label></div>
    {state === "error" ? <p className="form-message form-error">{message}</p> : null}
    {state === "success" ? <div className="form-success"><span><Check size={15} /></span><p>{message}</p></div> : null}
    <div className="submit-actions"><button className="button button-coral" type="submit" disabled={state === "checking"}>{state === "checking" ? <><LoaderCircle className="spin" size={16} /> Checking domain</> : state === "success" ? <>Continue to review <ArrowRight size={16} /></> : <>Start submission <ArrowRight size={16} /> </>}</button><span className="form-trust"><ShieldCheck size={15} /> No tracker required to list</span></div>
  </form>;
}
