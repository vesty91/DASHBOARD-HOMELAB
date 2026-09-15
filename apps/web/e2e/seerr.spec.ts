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

test("creates a Seerr integration without leaking the API key from the browser", async ({
  page,
}) => {
  const leaked: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("apikey=") ||
      request.url().includes("api_key=") ||
      request.url().includes("notareal-seerr-apikey") ||
      request.url().includes("/api/v1/request/") ||
      request.url().includes("/approve") ||
      request.url().includes("/decline") ||
      request.method() === "DELETE" ||
      (/seerr\.invalid/i.test(request.url()) && request.method() !== "OPTIONS")
    )
      leaked.push(`${request.method()} ${request.url()}`);
  });
  await loginAdmin(page);
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("seerr");
  await expect(page.getByLabel("URL de base")).toHaveAttribute(
    "placeholder",
    "https://seerr.example:5055",
  );
  await expect(
    page.getByText("La clé API se configure ensuite comme secret serveur"),
  ).toBeVisible();
  await page.getByLabel("Nom").fill("Seerr Lab");
  await page.getByLabel("URL de base").fill("https://seerr.invalid:5055");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
  await page.getByLabel(/Clé API Seerr/).fill("notareal-seerr-apikey-0123456789");
  await page.getByRole("button", { name: "Enregistrer le secret" }).click();
  await expect(page.getByText("Configuré")).toBeVisible();
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: "Seerr Lab" })).toBeVisible();
  await page
    .locator("article.ui-card")
    .filter({ has: page.getByRole("heading", { name: "Seerr Lab" }) })
    .getByRole("link", { name: "Ouvrir" })
    .click();
  await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]{36}$/i);
  await expect(page.getByRole("heading", { level: 1, name: "Seerr Lab" })).toBeVisible();
  await expect(page.getByText("Seerr", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demandes" })).toBeVisible();
  await expect(page.getByLabel("ID demande")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approuver" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refuser" })).toBeVisible();
  await expect(
    page.getByText(/injoignable|indisponible|Délai|TLS|DNS|clé API|Clé API/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Application error")).toHaveCount(0);
  expect(leaked).toEqual([]);
});
