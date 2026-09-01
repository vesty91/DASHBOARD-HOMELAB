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

test("creates a Synology integration without calling DSM from the browser", async ({ page }) => {
  const leaked: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("passwd=") ||
      request.url().includes("sid=") ||
      request.url().includes("otp_code=")
    )
      leaked.push(request.url());
  });
  await loginAdmin(page);
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("synology");
  await expect(page.getByLabel("URL de base")).toHaveAttribute(
    "placeholder",
    "https://nas.example:5001",
  );
  await expect(
    page.getByText("Le compte est stocké en configuration ; le mot de passe se configure ensuite"),
  ).toBeVisible();
  await expect(page.getByText("L'accès au daemon Docker est hautement privilégié.")).toHaveCount(0);
  await page.getByLabel("Nom").fill("NAS Lab");
  await page.getByLabel("URL de base").fill("https://synology.invalid:5001");
  await page.getByLabel("Compte DSM").fill("monitor");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
  await page.getByLabel("Mot de passe DSM").fill("not-a-real-password");
  await page.getByRole("button", { name: "Enregistrer le secret" }).click();
  await expect(page.getByText("Configuré")).toBeVisible();
  await expect(page.getByLabel("Appareil de confiance DSM")).toHaveCount(0);
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: "NAS Lab" })).toBeVisible();
  await page.getByRole("link", { name: "Ouvrir" }).last().click();
  await expect(page.getByRole("heading", { name: "NAS Lab" })).toBeVisible();
  await expect(page.getByText("Synology DSM", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  await expect(
    page.getByText(/injoignable|indisponible|Délai|TLS|DNS|identifiants/i).first(),
  ).toBeVisible();
  await expect(page.getByText("Application error")).toHaveCount(0);
  expect(leaked).toEqual([]);
});
