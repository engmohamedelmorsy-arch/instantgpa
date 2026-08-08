import { expect, test } from "@playwright/test";
import { seedAcademicContext } from "./fixtures";

test("Free journey reuses one reviewed transcript through GPA and CGPA", async ({ page }) => {
  await seedAcademicContext(page);
  await page.goto("/transcript-gpa-calculator");

  await page.locator("#tiLoadSample").click();
  await page.locator("#tiDetect").click();
  await expect(page.getByRole("heading", { name: "Review transcript" })).toBeVisible();
  await expect(page.locator("#tiPreview")).toBeEnabled();
  await page.locator("#tiPreview").click();
  await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible();
  await page.locator("#tiConfirm").click();
  await expect(page.getByRole("heading", { name: "Your transcript is approved and ready" })).toBeVisible();

  await page.getByRole("link", { name: "Continue to GPA" }).click();
  await expect(page.locator("#gpaResult")).toBeVisible();
  const firstRow = page.locator(".course-row:not(.course-row--head)").first();
  await firstRow.locator(".course-name").fill("Current course");
  await firstRow.locator(".course-credits").fill("3");
  await firstRow.locator(".course-grade").selectOption("A");
  await expect(page.locator("#gpaResult .result-value")).toHaveText("4.000");

  await page.getByRole("link", { name: /Continue to CGPA/ }).click();
  await expect(page).toHaveURL(/\/cgpa-calculator/);
  await expect(page.locator("#cgpaCurCredits")).not.toHaveValue("");
  await page.locator("#cgpaCalc").click();
  await expect(page.locator("#cgpaResult .result-value")).toBeVisible();
  await expect(page.getByText("Your free workflow is complete.")).toBeVisible();
});
