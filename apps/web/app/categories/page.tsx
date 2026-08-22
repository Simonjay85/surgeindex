import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AppShell, SectionHeading, SourceBadge } from "../../components/app-shell";
import { getCategories } from "../../lib/demo-data";

export const metadata = { title: "Categories" };

export default function CategoriesPage() {
  const categories = getCategories();
  return <AppShell><div className="container page-hero"><div className="page-hero-grid"><div><div className="eyebrow">EXPLORE BY CATEGORY</div><h1>Find your corner of the internet.</h1><p>Browse the same transparent attention signals through the lenses people actually use to discover new products.</p></div><div className="page-hero-aside"><span>categories</span><strong>{categories.length}</strong><SourceBadge source="demo" compact /></div></div><div className="section-tight"><SectionHeading title="The index, sorted by subject" description="Category membership is editorial and can be refined after submission review." action={<Link className="button button-coral button-small" href="/submit">Add your site <ArrowRight size={14} /></Link>} /><div className="category-grid">{categories.map((category) => <Link className="category-card" href={`/categories/${category.slug}`} key={category.slug}><div><h3>{category.name}</h3><p>{category.description}</p></div><div className="category-count"><span>{category.siteCount === 0 ? "Ready for the next listing" : "sites in the preview"}</span><strong>{category.siteCount}</strong><ArrowUpRight size={16} /></div></Link>)}</div></div></div></AppShell>;
}
