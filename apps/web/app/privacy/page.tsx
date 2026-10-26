import type { Metadata } from "next";
import { ProsePage } from "../../components/trends/prose-page";

export const metadata: Metadata = { title: "Privacy", description: "How SurgeIndex handles data: public platform charts in, no visitor profiling out.", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <ProsePage kicker="Privacy" title={<>Signals, <em>not surveillance.</em></>} lede="SurgeIndex reads public charts about the internet. It does not need to know who you are to show them to you.">
      <section>
        <h2>What we collect from platforms</h2>
        <p>Every hour we read public, aggregate charts: Google Trends daily searches, YouTube&apos;s Most Popular chart (when enabled), Reddit&apos;s r/all, the Hacker News front page and GitHub Trending. We store titles, links, public counts (views, upvotes, points, stars, approximate search volume), public author or channel names and thumbnails as published by those platforms. We do not collect private messages, account data or anything behind a login.</p>
      </section>
      <section>
        <h2>What we collect from you</h2>
        <p>Browsing the Top 10 boards requires no account. Your region choice (Global or Vietnam) is kept in your own browser&apos;s local storage. Standard web server logs (IP address, user agent, requested page) may be kept briefly by our hosting for security and abuse prevention.</p>
      </section>
      <section>
        <h2>Outbound links</h2>
        <p>Items link to the original platform or publisher. Once you leave SurgeIndex, that site&apos;s own privacy policy applies. Thumbnails load directly from the platform that published them.</p>
      </section>
      <section>
        <h2>Contact and removal</h2>
        <p>If an item about you appears in an archive and you would like it reviewed, contact the operator through the address on the site and we will look at it promptly. Note that the item usually remains on the original platform.</p>
      </section>
      <section>
        <h2>Important note</h2>
        <p>This notice describes the Phase 1 product. It should be reviewed by a qualified professional before any commercial launch or before new data sources are added.</p>
      </section>
    </ProsePage>
  );
}
