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

test("library template creates a normal app without inventing a URL", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http://localhost:3000") && !url.startsWith("http://127.0.0.1:3000"))
      external.push(url);
  });
  await loginAdmin(page);
  await page.goto("/apps");
  await page.getByRole("link", { name: "Ajouter une application" }).click();
  await expect(page).toHaveURL(/\/apps\/library/);
  await page.getByLabel("Rechercher").fill("Jellyfin");
  const jellyfinCard = page.locator(".entity-card", {
    has: page.getByRole("heading", { name: "Jellyfin", exact: true }),
  });
  await jellyfinCard.getByRole("link", { name: "Ajouter" }).click();
  await expect(page).toHaveURL(/template=jellyfin/);
  await expect(page.getByLabel("Nom")).toHaveValue("Jellyfin");
  await expect(page.getByLabel("Description")).toHaveValue(/Serveur média/);
  await expect(page.getByLabel("URL")).toHaveValue("");
  await expect(page.locator('input[name="iconRef"]')).toHaveValue("/app-icons/jellyfin.svg");
  await expect(page.getByRole("img", { name: "Icône Jellyfin" })).toBeVisible();
  await expect(page.getByLabel("Healthcheck activé")).not.toBeChecked();
  await page.getByLabel("URL").fill("http://192.168.50.20:8096");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/apps$/);
  const card = page.locator(".entity-card", { hasText: "Jellyfin" });
  await expect(card.getByRole("heading", { name: "Jellyfin" })).toBeVisible();
  await expect(card.getByRole("img", { name: "Icône Jellyfin" })).toBeVisible();
  await expect(card.getByText("http://192.168.50.20:8096/")).toBeVisible();
  await card.getByRole("link", { name: "Modifier" }).click();
  await page.getByLabel("URL").fill("http://192.168.50.21:8096");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("http://192.168.50.21:8096/")).toBeVisible();
  await page.reload();
  await expect(page.getByText("http://192.168.50.21:8096/")).toBeVisible();
  expect(external).toEqual([]);
});

test("legacy apps stay hidden until searched or toggled", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/apps/library");
  await expect(page.getByRole("heading", { name: "Seerr", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Readarr", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Jellyseerr", exact: true })).toHaveCount(0);
  await page.getByLabel("Afficher les applications anciennes").check();
  await expect(page.getByRole("heading", { name: "Readarr", exact: true })).toBeVisible();
  await expect(page.getByText("Retiré", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Afficher les applications anciennes").uncheck();
  await page.getByLabel("Rechercher").fill("overseerr");
  const overseerrCard = page.locator(".entity-card", {
    has: page.getByRole("heading", { name: "Overseerr", exact: true }),
  });
  await expect(overseerrCard.getByText("Legacy", { exact: true })).toBeVisible();
  await overseerrCard.getByRole("button", { name: "Remplacé par Seerr" }).click();
  await expect(page.getByRole("heading", { name: "Seerr", exact: true })).toBeVisible();
  await page.getByLabel("Rechercher").fill("overseerr");
  await overseerrCard.getByRole("link", { name: "Ajouter" }).click();
  await expect(page).toHaveURL(/template=overseerr/);
  await expect(page.getByText("Cette application est ancienne.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Seerr" })).toBeVisible();
});

test("custom app creation remains available", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/apps/library");
  await page.getByRole("link", { name: "Ajouter manuellement" }).click();
  await expect(page).toHaveURL(/\/apps\/new$/);
  await page.getByLabel("Nom").fill("Custom Fixture");
  await page.getByLabel("URL", { exact: true }).fill("http://192.168.50.30/");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: "Custom Fixture" })).toBeVisible();
});
