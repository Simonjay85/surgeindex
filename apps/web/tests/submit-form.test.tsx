import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmitForm } from "../components/submit-form";

const siteId = "50000000-0000-4000-8000-000000000001";

async function submitWithStatus(status: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { siteId, slug: "new-site", status } }),
  }));
  render(<SubmitForm />);
  fireEvent.change(screen.getByRole("textbox", { name: "Website URL" }), { target: { value: "https://newsite.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Start submission" }));
  await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
}

describe("SubmitForm post-submit actions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps pending submissions in the dashboard without linking to an unavailable claim route", async () => {
    await submitWithStatus("pending_review");
    expect(screen.getByRole("link", { name: /Open site dashboard/i })).toHaveAttribute("href", `/dashboard/sites/${siteId}`);
    expect(screen.queryByRole("link", { name: /Start ownership claim/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Ownership claiming becomes available after moderation approves and activates the listing/i)).toBeInTheDocument();
  });

  it("offers ownership claiming only after the listing is active", async () => {
    await submitWithStatus("active");
    expect(screen.getByRole("link", { name: /Open site dashboard/i })).toHaveAttribute("href", `/dashboard/sites/${siteId}`);
    expect(screen.getByRole("link", { name: /Start ownership claim/i })).toHaveAttribute("href", `/claim/${siteId}`);
    expect(screen.queryByText(/Ownership claiming becomes available after moderation approves/i)).not.toBeInTheDocument();
  });
});
