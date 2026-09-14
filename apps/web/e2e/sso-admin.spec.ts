import { expect, test, type Page } from "@playwright/test";

const adminPassword = "correct horse battery staple";

test.setTimeout(180_000);

async function loginAdmin(page: Page) {
  await page.goto("/setup");
  if (/\/setup$/.test(page.url())) {
    await page.getByLabel("Identifiant").fill("Vesty");
    await page.getByLabel("Nom affiché").fill("Administrator");
    await page.getByLabel("Mot de passe").fill(adminPassword);
    await page.getByRole("button", { name: "Initialiser" }).click();
    await expect(page).toHaveURL(/\/login/);
  }
  if (!/\/login/.test(page.url())) await page.goto("/login");
  await page.getByLabel("Identifiant").fill("Vesty");
  await page.getByLabel("Mot de passe").fill(adminPassword);
  await page.getByRole("button", { name: "Connexion" }).click();
  await expect(page).toHaveURL(/\/(admin|boards)/);
}

test("admin can open OIDC, audit and session pages", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "OpenID Connect" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Audit" })).toBeVisible();
  await page.getByRole("link", { name: "OpenID Connect" }).click();
  await expect(page.getByRole("heading", { name: "OpenID Connect" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mapping de groupes" })).toBeVisible();
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Journal d'audit" })).toBeVisible();
  await page.goto("/account/security");
  await expect(page.getByRole("heading", { name: "Sécurité du compte" })).toBeVisible();
  await expect(page.getByText("Session actuelle", { exact: true })).toBeVisible();
});
