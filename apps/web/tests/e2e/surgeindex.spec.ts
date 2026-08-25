import { expect, test } from "@playwright/test";

test("homepage exposes live ranking controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Watch websites go viral in real time." })).toBeVisible();
  await expect(page.getByText("THE LIVE BOARD", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "24H" }).click();
  await expect(page).toHaveURL(/window=24h/);
});

test("submit flow validates and accepts a domain in demo mode", async ({ page }) => {
  await page.goto("/submit");
  await page.getByLabel("Website URL").fill("https://newsite.example");
  await page.getByRole("button", { name: "Start submission" }).click();
  await expect(page.getByText(/newsite\.example is ready for review/)).toBeVisible();
});

test("profile, claim, and dashboard surfaces are reachable", async ({ page }) => {
  await page.goto("/site/promptharbor-com");
  await expect(page.getByRole("heading", { name: "PromptHarbor" })).toBeVisible();
  await page.getByRole("link", { name: "Claim this site" }).click();
  await expect(page).toHaveURL(/\/claim\/site-promptharbor/);
  await expect(page.getByRole("heading", { name: "Claim PromptHarbor." })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Good morning, Aaron." })).toBeVisible();
});

test("all five sponsored placements render with page route context", async ({ page }) => {
  const placements = [
    ["/", "homepage_boosted", "/"],
    ["/categories/ai-tools", "category_boosted", "/categories/ai-tools"],
    ["/rankings", "ranking_feed_insert", "/rankings"],
    ["/site/promptharbor-com", "site_profile_recommendation", "/site/promptharbor-com"],
    ["/breakouts", "breakout_sponsor", "/breakouts"],
  ] as const;

  for (const [path, placement, route] of placements) {
    const serveResponse = page.waitForResponse((response) => {
      if (!response.url().includes("/api/boost/serve")) return false;
      const query = new URL(response.url()).searchParams;
      return query.get("placement") === placement && query.get("route") === route;
    });
    await page.goto(path);
    const response = await serveResponse;
    expect(response.ok()).toBe(true);
    await expect(page.locator(".sponsored-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Demo delivery · not billable", { exact: true })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("article", { name: "Sponsored placement" })).toBeVisible();
  await expect(page.getByText("Sponsored", { exact: true })).toBeVisible();
});
