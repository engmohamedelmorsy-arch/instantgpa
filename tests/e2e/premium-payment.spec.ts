import { expect, test } from "@playwright/test";
import { mockPremiumFirebase, mockSignedOutFirebase, seedAcademicContext } from "./fixtures";

test("Premium workspace opens from a verified paid entitlement and reuses transcript courses", async ({ page }) => {
  await seedAcademicContext(page, true);
  await mockPremiumFirebase(page);
  await page.goto("/pro-workspace");

  await expect(page.getByRole("heading", { name: "Your live academic operating system" })).toBeVisible();
  await expect(page.locator("#proToolSelect")).toBeVisible();
  await page.locator("#proToolSelect").selectOption("transfer");
  await expect(page.locator("#transferSource")).toContainText("CS101");
  await expect(page.locator("#transferSource")).toContainText("Introduction to Programming");
});

test("live pricing routes a visitor into paid account checkout", async ({ page }) => {
  await mockSignedOutFirebase(page);
  await page.route("**/api/pricing", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      configured: true,
      paymentAvailable: true,
      paymentMode: "live",
      tier: "standard",
      plan: "InstantGPA Premium",
      monthly: { price: 5, currency: "USD" },
      annual: { price: 50, currency: "USD" },
    }),
  }));
  await page.goto("/pricing");
  const monthly = page.getByRole("link", { name: /Pay with PayPal or card.*monthly/i });
  await expect(monthly).toHaveAttribute("href", /\/account\?subscribe=1&billing=monthly/);
  await monthly.click();
  await expect(page).toHaveURL(/\/account\?subscribe=1&billing=monthly/);
  await expect(page.getByRole("heading", { name: "Create your paid Premium account" })).toBeVisible();
});
