"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }).catch(() => undefined);
    router.push("/auth/sign-in");
    router.refresh();
  }

  return <button type="button" className="dashboard-signout" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>;
}
