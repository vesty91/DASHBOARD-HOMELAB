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

test("creates an Immich integration without leaking the API key from the browser", async ({
  page,
}) => {
  const leaked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("apiKey=") || request.url().includes("x-api-key"))
      leaked.push(request.url());
  });
  await loginAdmin(page);
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("immich");
  await expect(page.getByLabel("URL de base")).toHaveAttribute(
    "placeholder",
    "https://immich.example:2283",
  );
  await expect(
    page.getByText("La clé API se configure ensuite comme secret serveur"),
  ).toBeVisible();
  await page.getByLabel("Nom").fill("Photos Lab");
  await page.getByLabel("URL de base").fill("https://immich.invalid:2283");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
  await page.getByLabel("Clé API Immich").fill("not-a-real-token");
  await page.getByRole("button", { name: "Enregistrer le secret" }).click();
  await expect(page.getByText("Configuré")).toBeVisible();
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: "Photos Lab" })).toBeVisible();
  await page
    .locator("article.ui-card")
    .filter({ has: page.getByRole("heading", { name: "Photos Lab" }) })
    .getByRole("link", { name: "Ouvrir" })
    .click();
  await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]{36}$/i);
  await expect(page.getByRole("heading", { level: 1, name: "Photos Lab" })).toBeVisible();
  await expect(page.getByText("Immich", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  await expect(
    page.getByText(/injoignable|indisponible|Délai|TLS|DNS|clé API/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Application error")).toHaveCount(0);
  expect(leaked).toEqual([]);
});
