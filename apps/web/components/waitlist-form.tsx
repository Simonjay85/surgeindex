"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

export function WaitlistForm({ topic }: { topic: string }) {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  if (joined) return <div className="waitlist-success"><span><Check size={16} /></span><div><strong>You’re on the list.</strong><p>We’ll send one useful note when {topic} opens up.</p></div></div>;
  return <form className="waitlist-form" onSubmit={(event) => { event.preventDefault(); if (email.includes("@")) setJoined(true); }}><label className="sr-only" htmlFor={`waitlist-${topic}`}>Email address</label><input id={`waitlist-${topic}`} value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@company.com" required /><button className="button button-dark" type="submit">Join waitlist <ArrowRight size={15} /></button></form>;
}
