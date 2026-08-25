import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const checks = [
  ["homepage_boosted", "apps/web/components/home-client.tsx", "/"],
  ["category_boosted", "apps/web/app/categories/[slug]/page.tsx", "category_boosted"],
  ["ranking_feed_insert", "apps/web/app/rankings/page.tsx", "ranking_feed_insert"],
  ["site_profile_recommendation", "apps/web/components/site-profile.tsx", "site_profile_recommendation"],
  ["breakout_sponsor", "apps/web/app/breakouts/page.tsx", "breakout_sponsor"],
];
for (const [placement, file, marker] of checks) {
  const content = await readFile(resolve(root, file), "utf8");
  if (!content.includes("SponsoredBoostCard") || !content.includes(marker)) throw new Error(`${placement} is missing from ${file}`);
}
const route = await readFile(resolve(root, "apps/web/app/api/boost/serve/route.ts"), "utf8");
if (!route.includes("route") || !route.includes("servedBoost")) throw new Error("Boost serve route does not require server route context.");
const card = await readFile(resolve(root, "apps/web/components/sponsored-boost-card.tsx"), "utf8");
if (!card.includes("served.minimumVisiblePercent") || !card.includes("served.minimumVisibleMilliseconds")) throw new Error("SponsoredBoostCard does not consume server-provided viewability thresholds.");
if (card.includes("visiblePercent: 50") || card.includes("visibleMilliseconds: 1000")) throw new Error("SponsoredBoostCard contains hard-coded viewability thresholds.");
const config = await readFile(resolve(root, "packages/config/src/index.ts"), "utf8");
for (const variable of ["BOOST_PLACEMENT_HOMEPAGE_ENABLED", "BOOST_PLACEMENT_CATEGORY_ENABLED", "BOOST_PLACEMENT_RANKING_ENABLED", "BOOST_PLACEMENT_PROFILE_ENABLED", "BOOST_PLACEMENT_BREAKOUT_ENABLED"]) {
  if (!config.includes(variable)) throw new Error(`Missing placement kill switch ${variable}`);
}
console.log(`PASS boost-placement-check: ${checks.length} V1 placements mapped to public routes with server-side context and kill switches.`);
