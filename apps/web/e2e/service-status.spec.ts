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

test("adds a service-status widget, persists after reload and stays non-public", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/apps");
  await page.getByRole("link", { name: "Application personnalisée" }).click();
  await page.getByLabel("Nom").fill("Status App");
  await page.getByLabel("URL", { exact: true }).fill("http://192.168.1.40/");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: "Status App" })).toBeVisible();

  await page.goto("/boards");
  await page.getByRole("button", { name: "Nouveau board" }).click();
  await page.getByRole("dialog").getByLabel("Nom").fill("Service Status");
  await page.getByRole("dialog").getByLabel("Slug").fill("service-status");
  await page.getByRole("dialog").getByRole("button", { name: "Créer" }).click();
  await expect(page).toHaveURL(/\/boards\/service-status\/edit/);

  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  await page.getByRole("button", { name: "Ajouter Statut des services" }).click();
  await expect(page.getByText("Sauvegardé")).toBeVisible();
  await expect(
    page.locator("[data-source-type='app']").filter({ hasText: "Status App" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator("[data-source-type='app']").filter({ hasText: "Status App" }),
  ).toBeVisible();

  await page.getByLabel("Visibilité").selectOption("public");
  await page.getByRole("button", { name: "Enregistrer les métadonnées" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Public boards may only contain known public-safe widgets with valid configuration",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ajouter un widget" }).click();
  const addServiceStatus = page.getByRole("button", { name: "Ajouter Statut des services" });
  await expect(addServiceStatus).toBeVisible();
});
