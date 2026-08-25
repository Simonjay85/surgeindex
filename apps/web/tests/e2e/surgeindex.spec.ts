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

test("Public Free hides every sponsored placement and payment entry point", async ({ page }) => {
  const serveRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/boost/serve")) serveRequests.push(request.url());
  });

  for (const path of ["/", "/categories/ai-tools", "/rankings", "/site/promptharbor-com", "/breakouts"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator(".sponsored-card")).toHaveCount(0);
  }
  expect(serveRequests).toEqual([]);

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Listing and organic ranking are free." })).toBeVisible();
  await expect(page.getByText("No payment required", { exact: true })).toBeVisible();

  await page.goto("/boost");
  await expect(page.getByRole("heading", { name: "Public Free is open. Paid distribution is not." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Checkout|Buy|Create a campaign/i })).toHaveCount(0);
});
