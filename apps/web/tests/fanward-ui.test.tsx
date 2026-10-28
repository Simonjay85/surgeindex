import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FanwardAdminQueueResult,
  FanwardAdminReviewItem,
  FanwardOwnerWorkspace,
  FanwardRevisionDto,
  PublicFanwardCreatorDetail,
} from "../lib/server/fanward-service";
import { AdminFanwardClient } from "../components/admin-fanward-client";
import { CreatorCard } from "../components/creator-card";
import { FanwardProfile } from "../components/fanward-profile";
import { FanwardProfileForm } from "../components/fanward-profile-form";
import { HomeClient } from "../components/home-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../components/rank-momentum-showcase", () => ({ RankMomentumShowcase: () => <div data-testid="rank-momentum" /> }));

const category = { id: "20000000-0000-4000-8000-000000000001", slug: "technology", name: "Technology" };
const primarySite = { slug: "signal-studio", name: "Signal Studio", domain: "signal.example", verification: "tracker" as const };
const impact = {
  score: 74,
  state: "eligible" as const,
  confidence: .82,
  version: "fanward-impact-v1" as const,
  sourceVersion: "site-score-v1",
  source: "tracker" as const,
  updatedAt: "2026-08-30T08:00:00.000Z",
  components: {
    verifiedReach: { score: 80, available: true, configuredWeight: .3, appliedWeight: .5 },
    attentionMomentum: { score: 68, available: true, configuredWeight: .3, appliedWeight: .5 },
    engagementQuality: { score: null, available: false, configuredWeight: .2, appliedWeight: 0 },
    trustConfidence: { score: null, available: false, configuredWeight: .2, appliedWeight: 0 },
  },
};
const creator: PublicFanwardCreatorDetail = {
  slug: "alex-river-a1b2c3",
  displayName: "Alex River",
  headline: "Independent technology educator",
  bioExcerpt: "Explaining web infrastructure with evidence and clear examples.",
  bio: "Explaining web infrastructure with evidence and clear examples for curious builders.",
  category,
  logoUrl: null,
  primarySite,
  impact,
  publishedAt: "2026-08-29T08:00:00.000Z",
};

function revision(overrides: Partial<FanwardRevisionDto> = {}): FanwardRevisionDto {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    displayName: "Alex River",
    headline: "Independent technology educator",
    bio: "Explaining web infrastructure with evidence and clear examples for curious builders.",
    category,
    status: "pending",
    createdAt: "2026-08-29T08:00:00.000Z",
    updatedAt: "2026-08-30T08:00:00.000Z",
    submittedAt: "2026-08-30T08:00:00.000Z",
    publishedAt: null,
    reviewedAt: null,
    reviewReason: null,
    ...overrides,
  };
}

function adminItem(overrides: Partial<FanwardAdminReviewItem> = {}): FanwardAdminReviewItem {
  return {
    profileId: "10000000-0000-4000-8000-000000000001",
    profileStatus: "pending",
    slug: creator.slug,
    owner: { id: "40000000-0000-4000-8000-000000000001", name: "Owner Name", email: "owner@example.com" },
    primarySite: { id: "50000000-0000-4000-8000-000000000001", ...primarySite, status: "active", ownership: "claimed" },
    pendingRevision: revision(),
    publishedRevision: null,
    submittedAt: "2026-08-30T08:00:00.000Z",
    eligibility: { eligible: true, reason: null },
    ...overrides,
  };
}

function queue(items: FanwardAdminReviewItem[], total = items.length, offset = 0): FanwardAdminQueueResult {
  return { items, total, limit: 50, offset, nextOffset: offset + 50 < total ? offset + 50 : null };
}

describe("Fanward UI truth boundaries", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows an explicit no-score state instead of inventing creator metrics", () => {
    render(<CreatorCard creator={{ ...creator, impact: { ...impact, score: null, state: "building_baseline", confidence: 0, sourceVersion: null, updatedAt: null } }} />);
    expect(screen.getByText("Building a verified baseline")).toBeInTheDocument();
    expect(screen.getByText("No score is shown until the site evidence is eligible.")).toBeInTheDocument();
    expect(screen.queryByText(/followers|payout|conversion/i)).not.toBeInTheDocument();
  });

  it("labels renormalized applied weight separately from configured weight", () => {
    render(<FanwardProfile creator={creator} />);
    expect(screen.getAllByText("50% weight applied")).toHaveLength(2);
    expect(screen.getAllByText("Configured 30% weight · normalized across available evidence")).toHaveLength(2);
    expect(screen.getAllByText("Unavailable · 0% applied")).toHaveLength(2);
    expect(screen.getByText(/does not report follower counts/i)).toBeInTheDocument();
  });

  it("keeps an existing primary site visible and immutable after eligibility is lost", () => {
    const workspace: FanwardOwnerWorkspace = {
      profile: { id: "10000000-0000-4000-8000-000000000001", slug: creator.slug, primarySiteId: "50000000-0000-4000-8000-000000000001", status: "active", createdAt: "2026-08-29T08:00:00.000Z", updatedAt: "2026-08-30T08:00:00.000Z" },
      primarySite: { id: "50000000-0000-4000-8000-000000000001", ...primarySite, verification: "unverified", status: "active", ownership: "claimed", eligible: false, eligibilityReason: "The linked site no longer has a verified traffic source." },
      published: revision({ status: "published", publishedAt: "2026-08-29T08:00:00.000Z" }),
      draft: null,
      pending: null,
      eligibleSites: [{ id: "60000000-0000-4000-8000-000000000001", slug: "other-site", name: "Other Site", domain: "other.example", verification: "ga4", logoUrl: null }],
      categories: [category],
      lastReviewReason: null,
    };
    render(<FanwardProfileForm initialWorkspace={workspace} turnstileRequired={false} />);
    const siteSelect = screen.getByRole("combobox", { name: /Verified primary site/i });
    expect(siteSelect).toBeDisabled();
    expect(siteSelect).toHaveValue("50000000-0000-4000-8000-000000000001");
    expect(screen.getByText("The linked primary site is no longer eligible")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Other Site/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save draft/i })).toBeDisabled();
  });

  it("requires an inline admin confirmation before any moderation request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminFanwardClient initialQueue={queue([adminItem()])} />);
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Verified site and copy reviewed." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("group", { name: "Confirm Approve" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Confirm Approve" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps reject available but blocks restore for an ineligible suspended profile with pending copy", () => {
    render(<AdminFanwardClient initialQueue={queue([adminItem({ profileStatus: "suspended", pendingRevision: revision(), eligibility: { eligible: false, reason: "Traffic verification is no longer active." } })])} />);
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Restore after eligibility review." } });
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(screen.getByRole("group", { name: "Confirm Request changes" })).toBeInTheDocument();
    expect(screen.getByText("Approval blocked by site eligibility")).toBeInTheDocument();
  });

  it("keeps urgent suspension available while an active profile has a pending edit", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminFanwardClient initialQueue={queue([adminItem({
      profileStatus: "active",
      pendingRevision: revision(),
      publishedRevision: revision({ id: "30000000-0000-4000-8000-000000000002", status: "published", publishedAt: "2026-08-29T08:00:00.000Z" }),
    })])} />);
    fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Urgent public-content safety review." } });
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Suspend" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(screen.getByRole("group", { name: "Confirm Suspend" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests the next deterministic admin offset", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: queue([], 51, 50) }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminFanwardClient initialQueue={queue([adminItem()], 51)} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=50&offset=50");
  });

  it("renders the live Fanward homepage CTA only from the server-derived flag", () => {
    const props = { initialSites: [], heroPulse: [], categories: [], isDemo: true, initialWindow: "live" };
    const { rerender } = render(<HomeClient {...props} fanwardEnabled={false} />);
    expect(screen.queryByRole("heading", { name: "Creators, backed by a verified site." })).not.toBeInTheDocument();
    rerender(<HomeClient {...props} fanwardEnabled />);
    const heading = screen.getByRole("heading", { name: "Creators, backed by a verified site." });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    expect(within(section!).getByRole("link", { name: /Explore Fanward/ })).toHaveAttribute("href", "/fanward");
    expect(within(section!).queryByText(/coming soon|preview/i)).not.toBeInTheDocument();
  });
});
