import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search, ShieldCheck, UserRound } from "lucide-react";
import { getServerEnv } from "@surge/config";
import { notFound } from "next/navigation";
import { AppShell, EmptyState } from "../../components/app-shell";
import { CreatorCard } from "../../components/creator-card";
import { listPublicFanwardCreators } from "../../lib/server/fanward-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fanward creator directory",
  description: "Discover approved creators through explainable Impact Scores derived from their verified primary sites.",
  alternates: { canonical: "/fanward" },
  robots: { index: true, follow: true },
};

type DirectorySearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function nextPageHref(input: { q: string; category: string; cursor: string }) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.category) params.set("category", input.category);
  params.set("cursor", input.cursor);
  return `/fanward?${params.toString()}`;
}

export default async function FanwardDirectoryPage({ searchParams }: { searchParams: DirectorySearchParams }) {
  if (!getServerEnv().FEATURE_CREATORS) notFound();

  const values = await searchParams;
  const q = one(values.q).trim().slice(0, 80);
  const category = one(values.category).trim().slice(0, 80);
  const cursor = one(values.cursor).trim().slice(0, 512);

  let result;
  try {
    result = await listPublicFanwardCreators({ q: q || undefined, category: category || undefined, cursor: cursor || undefined, limit: 24 });
  } catch (error) {
    console.error("Unable to render the Fanward directory", error);
    return <AppShell><div className="container page-hero fanward-directory"><div className="fanward-directory-hero"><div><h1>Creator attention, with the evidence attached.</h1><p>Fanward profiles connect approved creators to a verified primary site and an explainable, site-derived Impact Score.</p></div></div><div className="section-tight"><EmptyState title="Fanward could not be loaded" description="The creator directory is temporarily unavailable. No placeholder profiles or estimated metrics have been substituted." action={<Link className="button button-quiet" href="/fanward">Try again</Link>} /></div></div></AppShell>;
  }

  return <AppShell><div className="container page-hero fanward-directory">
    <div className="fanward-directory-hero">
      <div><h1>Creator attention, with the evidence attached.</h1><p>Fanward connects approved creator profiles to verified primary sites. Impact Scores explain eligible site evidence; they do not estimate followers, payouts, or a creator&apos;s personal value.</p></div>
      <div className="fanward-directory-proof"><ShieldCheck size={19} /><div><strong>Verified-site profiles only</strong><span>Newest approved profiles appear first. Scores never determine directory order.</span></div></div>
    </div>

    <form className="fanward-directory-filters" action="/fanward" method="get">
      <label><span>Search creators</span><div className="fanward-search-input"><Search size={16} aria-hidden="true" /><input name="q" type="search" defaultValue={q} maxLength={80} placeholder="Name, headline, or verified site" /></div></label>
      <label><span>Category</span><select name="category" defaultValue={category}><option value="">All categories</option>{result.categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
      <button className="button button-coral" type="submit">Apply filters</button>
      {q || category || cursor ? <Link className="button button-quiet fanward-filter-clear" href="/fanward">Clear</Link> : null}
    </form>

    <div className="fanward-directory-summary" role="status"><span><UserRound size={15} /> {result.total.toLocaleString("en-US")} approved {result.total === 1 ? "creator" : "creators"}</span><span>Ordered by approval date</span></div>

    {result.creators.length ? <div className="creator-grid">{result.creators.map((creator) => <CreatorCard creator={creator} key={creator.slug} />)}</div> : <EmptyState title={q || category ? "No approved creators match these filters" : "The creator directory is getting started"} description={q || category ? "Try a broader search or another category. Only approved public profiles can appear here." : "There are no approved creator profiles yet. Site owners can prepare a profile from their dashboard and submit it for moderation."} action={<Link className="button button-coral" href="/dashboard/fanward">Create a creator profile <ArrowRight size={15} /></Link>} />}

    {result.nextCursor ? <nav className="fanward-pagination" aria-label="Creator directory pages"><Link className="button button-quiet" href={nextPageHref({ q, category, cursor: result.nextCursor })}>Next creators <ArrowRight size={15} /></Link></nav> : null}
  </div></AppShell>;
}
