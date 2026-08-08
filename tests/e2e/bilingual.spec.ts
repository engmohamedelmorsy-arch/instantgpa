import { expect, test } from "@playwright/test";

test("the public interface exposes only English and Arabic and keeps header actions on the right", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#languageSelect option")).toHaveCount(2);
  await expect(page.locator("#languageSelect option").nth(0)).toHaveAttribute("value", "en");
  await expect(page.locator("#languageSelect option").nth(1)).toHaveAttribute("value", "ar");

  await expect(page.locator("#languageSelect")).toBeEnabled();
  await page.locator("#languageSelect").selectOption("ar");
  await page.waitForURL(/\/ar\/?$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#heroTitle")).toContainText("تحكّم فيه");

  if ((page.viewportSize()?.width || 0) >= 760) {
    const actions = await page.locator(".modern-nav-actions").boundingBox();
    const links = await page.locator(".modern-nav-links").boundingBox();
    expect(actions).not.toBeNull();
    expect(links).not.toBeNull();
    expect(actions!.x + actions!.width).toBeGreaterThan((page.viewportSize()?.width || 0) / 2);
    expect(links!.x + links!.width).toBeGreaterThan((page.viewportSize()?.width || 0) / 2);
  }
});
