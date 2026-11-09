import { expect, test } from "@playwright/test";
import { getViolations, injectAxe } from "axe-playwright";

test("Trends homepage exposes platform navigation and mobile region controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /The internet's Top 10,\s*every hour\./ })).toBeVisible();

  const region = page.getByRole("group", { name: "Region" });
  const global = region.getByRole("button", { name: "Global" });
  const vietnam = region.getByRole("button", { name: "Vietnam" });
  await expect(global).toHaveAttribute("aria-pressed", "true");
  await vietnam.click();
  await expect(vietnam).toHaveAttribute("aria-pressed", "true");
  await expect(global).toHaveAttribute("aria-pressed", "false");

  const platforms = page.getByRole("navigation", { name: "Jump to a platform" });
  await platforms.getByRole("link", { name: "YouTube", exact: true }).click();
  await expect(page).toHaveURL(/#board-youtube$/);
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

test("Public Free core routes have no serious accessibility regressions", async ({ page }) => {
  const routes = ["/", "/rankings", "/breakouts", "/categories", "/search", "/submit", "/pricing", "/privacy", "/terms", "/acceptable-use"];
  const viewports = [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ];

  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${route} should render successfully`).toBeLessThan(400);

      if (route === "/") {
        const rankMomentum = page.locator(".rank-momentum-section");
        if (await rankMomentum.count()) {
          await rankMomentum.scrollIntoViewIfNeeded();
          await page.waitForTimeout(100);
        }
      }

      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.scrollWidth, `${route} should not overflow horizontally`).toBeLessThanOrEqual(layout.clientWidth + 1);

      await injectAxe(page);
      const serious = (await getViolations(page)).filter((violation) => violation.impact === "serious" || violation.impact === "critical");
      expect(
        serious.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length })),
        `${route} should have no serious/critical axe violations at ${viewport.width}px`,
      ).toEqual([]);
    }
  }
});
