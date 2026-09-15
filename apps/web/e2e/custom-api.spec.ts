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

test("creates a Custom API integration without leaking secrets from the browser", async ({
  page,
}) => {
  const leaked: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("apikey=") ||
      request.url().includes("api_key=") ||
      request.url().includes("notareal-custom-api-secret") ||
      request.url().includes("/approve") ||
      request.method() === "DELETE" ||
      (/custom-api\.invalid/i.test(request.url()) && request.method() !== "OPTIONS")
    )
      leaked.push(`${request.method()} ${request.url()}`);
  });
  await loginAdmin(page);
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("custom-api");
  await expect(page.getByLabel("URL de base")).toHaveAttribute(
    "placeholder",
    "https://api.example:8443",
  );
  await page.getByLabel("Nom").fill("API Lab");
  await page.getByLabel("URL de base").fill("https://custom-api.invalid:8443");
  await page
    .getByLabel("Endpoints autorisés")
    .fill(JSON.stringify([{ key: "status", label: "Status", path: "/status" }]));
  await page.getByLabel("En-tête de clé API").selectOption("X-Api-Key");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
  await page.getByLabel("Clé API (optionnelle)").fill("notareal-custom-api-secret-0123456789");
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Clé API (optionnelle)") })
    .getByRole("button", { name: "Enregistrer le secret" })
    .click();
  await expect(
    page
      .locator("form")
      .filter({ has: page.getByLabel("Clé API (optionnelle)") })
      .getByText("Configuré", { exact: true }),
  ).toBeVisible();
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: "API Lab" })).toBeVisible();
  await page
    .locator("article.ui-card")
    .filter({ has: page.getByRole("heading", { name: "API Lab" }) })
    .getByRole("link", { name: "Ouvrir" })
    .click();
  await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]{36}$/i);
  await expect(page.getByRole("heading", { level: 1, name: "API Lab" })).toBeVisible();
  await expect(page.getByText("API personnalisée", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  await expect(
    page.getByText(/injoignable|indisponible|Délai|TLS|DNS|identifiants|Clé API/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Application error")).toHaveCount(0);
  expect(leaked).toEqual([]);
});
