import { expect, test } from "@playwright/test";

test("bootstrap home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Homelab Dashboard" })).toBeVisible();
});
