"use client";

import Link from "next/link";
import { Menu, Search, Signal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const baseLinks = [
  ["Live", "/"],
  ["Rankings", "/rankings"],
  ["Breakouts", "/breakouts"],
  ["Categories", "/categories"],
  ["Methodology", "/methodology"],
  ["Search", "/search"],
  ["Submit site", "/submit"],
] as const;

export function MobileNavigation({ fanwardEnabled, radarEnabled }: { fanwardEnabled: boolean; radarEnabled: boolean }) {
  const pathname = usePathname();
  // Derive the open state from the pathname so a route change closes the
  // drawer without a synchronous setState call from an effect. This also
  // keeps the drawer from briefly rendering on the previous route.
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const open = openPathname === pathname;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = drawerRef.current;
    const focusable = drawer?.querySelector<HTMLElement>("a, button, [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const elements = Array.from(drawer.querySelectorAll<HTMLElement>("a, button, [tabindex]:not([tabindex='-1'])"));
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflowRef.current ?? "";
      previousOverflowRef.current = null;
    };
  }, [open]);

  function closeDrawer() {
    setOpenPathname(null);
    triggerRef.current?.focus();
  }

  return <>
    <button ref={triggerRef} className="mobile-menu icon-button" type="button" aria-expanded={open} aria-controls="mobile-navigation-drawer" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpenPathname((current) => current === pathname ? null : pathname)}>
      {open ? <X size={19} /> : <Menu size={19} />}
    </button>
    {open ? <>
      <button className="mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={closeDrawer} />
      <aside ref={drawerRef} id="mobile-navigation-drawer" className="mobile-nav-drawer" role="dialog" aria-modal="true" aria-labelledby="mobile-navigation-title">
        <div className="mobile-nav-heading"><div className="brand"><span className="brand-mark"><Signal size={15} /></span><span id="mobile-navigation-title">SurgeIndex</span></div><button className="icon-button" type="button" aria-label="Close menu" onClick={closeDrawer}><X size={18} /></button></div>
        <nav aria-label="Mobile primary navigation" className="mobile-nav-links">
          {baseLinks.map(([label, href]) => <Link key={href} href={href} onClick={closeDrawer}>{label === "Search" ? <><Search size={16} />{label}</> : label}</Link>)}
          {radarEnabled ? <Link href="/radar" onClick={closeDrawer}>Radar</Link> : null}
          {fanwardEnabled ? <Link href="/fanward" onClick={closeDrawer}>Fanward</Link> : null}
          <span className="mobile-nav-divider" />
          <Link href="/dashboard" onClick={closeDrawer}>Dashboard / Sign in</Link>
        </nav>
      </aside>
    </> : null}
  </>;
}
