import { notFound } from "next/navigation";
import { getServerEnv } from "@surge/config";
import { TrackerFixtureClient } from "../../../components/tracker-fixture-client";

export default async function TrackerFixturePage({ searchParams }: { searchParams: Promise<{ siteKey?: string; consent?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const env = getServerEnv();
  return <TrackerFixtureClient siteKey={query.siteKey ?? "pk_test_fixture_site"} collectorUrl={env.TRACKER_COLLECTOR_URL} requireConsent={query.consent === "required"} />;
}
