import type { Metadata } from "next";
import { ProsePage } from "../../components/trends/prose-page";

export const metadata: Metadata = { title: "Terms", description: "The rules for using SurgeIndex Top 10 boards.", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <ProsePage kicker="Terms" title={<>Clear rules for a <em>noisy web.</em></>} lede="SurgeIndex is an independent index of what is trending across public platforms. Here is what that does and does not mean.">
      <section>
        <h2>Independent, not affiliated</h2>
        <p>SurgeIndex is not affiliated with, endorsed by or sponsored by Google, YouTube, Reddit, Y Combinator, GitHub or X. Platform names and logos identify the source of each chart and belong to their owners.</p>
      </section>
      <section>
        <h2>Content belongs to its creators</h2>
        <p>Titles, thumbnails and links point to content published on other platforms. We show them to describe what is trending; ownership stays with the original creators. Linked content is not reviewed or endorsed by SurgeIndex.</p>
      </section>
      <section>
        <h2>Accuracy and availability</h2>
        <p>Rankings reflect each platform&apos;s public chart at the time of the hourly refresh, plus our published Heat Score. Platforms can change, delay or block access at any time; when that happens a board is marked delayed or unavailable rather than filled with estimates. The service is provided as-is, without guarantees of accuracy, completeness or uptime.</p>
      </section>
      <section>
        <h2>Fair use of SurgeIndex</h2>
        <p>Do not scrape SurgeIndex at a rate that degrades the service, and do not present SurgeIndex rankings as an official platform chart.</p>
      </section>
      <section>
        <h2>Professional review</h2>
        <p>This page describes the Phase 1 product and is not legal advice. It should be reviewed professionally before any commercial launch.</p>
      </section>
    </ProsePage>
  );
}
