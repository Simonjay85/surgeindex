import type { DemoSite } from "../lib/demo-data";

const palettes = ["coral", "plum", "moss", "gold", "sky"] as const;

export function SiteMark({ site, size = "default" }: { site: Pick<DemoSite, "name" | "domain" | "slug">; size?: "small" | "default" | "large" }) {
  const index = Array.from(site.slug).reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length;
  const initials = site.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className={`site-mark site-mark-${size} site-mark-${palettes[index]}`} aria-hidden="true">{initials}</span>;
}
