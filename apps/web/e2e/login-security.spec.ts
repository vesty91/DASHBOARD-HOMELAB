import { expect, test } from "@playwright/test";

test("login credentials form cannot serialize fields as a GET query string", async ({ page }) => {
  await page.goto("/login");
  const form = page.locator('form[action="/api/auth/callback/credentials"]');
  await expect(form).toHaveCount(1);
  await expect(form).toHaveAttribute("method", /post/i);
  await expect(form.locator('input[name="username"]')).toHaveCount(1);
  await expect(form.locator('input[name="password"][type="password"]')).toHaveCount(1);
  await expect(form.locator('input[name="callbackUrl"]')).toHaveAttribute("value", "/admin");
});

test("login drops credential-like query params from the URL", async ({ page }) => {
  await page.goto("/login?username=probe-user&password=not-a-real-secret");
  await expect(page).toHaveURL(/\/login\/?$/);
  expect(page.url()).not.toMatch(/username=/i);
  expect(page.url()).not.toMatch(/password=/i);
});
