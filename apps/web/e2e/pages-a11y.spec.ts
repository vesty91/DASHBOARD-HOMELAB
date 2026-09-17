import { expect, test, type Page } from "@playwright/test";
import { expectPageA11y } from "./a11y";

test.setTimeout(180_000);

async function loginAdmin(page: Page) {
  await page.goto("/");
  await expectPageA11y(page);

  await page.goto("/setup");
  if (/\/setup$/.test(page.url())) {
    await expectPageA11y(page);
    await page.getByLabel("Identifiant").fill("Vesty");
    await page.getByLabel("Nom affiché").fill("Administrator");
    await page.getByLabel("Mot de passe").fill("correct horse battery staple");
    await page.getByRole("button", { name: "Initialiser" }).click();
    await expect(page).toHaveURL(/\/login/);
  }

  if (!/\/login/.test(page.url())) await page.goto("/login");
  await expectPageA11y(page);
  await page.getByLabel("Identifiant").fill("Vesty");
  await page.getByLabel("Mot de passe").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Connexion" }).click();
  await expect(page).toHaveURL(/\/(admin|boards)/);
  await expect(page.getByRole("button", { name: "Administrator" })).toBeVisible();
}

test("main pages have no WCAG A/AA axe violations", async ({ page }) => {
  await loginAdmin(page);

  for (const path of [
    "/",
    "/boards",
    "/apps",
    "/integrations",
    "/automations",
    "/notifications",
    "/incidents",
    "/status-pages",
    "/reliability",
    "/topology",
    "/admin",
  ]) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/\/login|\/forbidden/);
    await expectPageA11y(page);
  }
});
