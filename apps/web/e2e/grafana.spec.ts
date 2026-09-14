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

test("creates a Grafana integration without leaking the service account token from the browser", async ({
  page,
}) => {
  const leaked: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("serviceAccountToken=") ||
      request.url().includes("glsa_notarealtoken") ||
      request.url().includes("/api/ds/query") ||
      request.url().includes("/api/datasources/proxy") ||
      request.url().includes("/api/prometheus/grafana/") ||
      (/grafana\.invalid/i.test(request.url()) && request.url().includes("/api/"))
    )
      leaked.push(request.url());
  });
  await loginAdmin(page);
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("grafana");
  await expect(page.getByLabel("URL de base")).toHaveAttribute(
    "placeholder",
    "https://grafana.example:3000",
  );
  await expect(
    page.getByText("Le jeton de compte de service se configure ensuite comme secret serveur"),
  ).toBeVisible();
  await page.getByLabel("Nom").fill("Grafana Lab");
  await page.getByLabel("URL de base").fill("https://grafana.invalid:3000");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
  await page.getByLabel(/compte de service Grafana/).fill("glsa_notarealtoken0123456789");
  await page.getByRole("button", { name: "Enregistrer le secret" }).click();
  await expect(page.getByText("Configuré")).toBeVisible();
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: "Grafana Lab" })).toBeVisible();
  await page
    .locator("article.ui-card")
    .filter({ has: page.getByRole("heading", { name: "Grafana Lab" }) })
    .getByRole("link", { name: "Ouvrir" })
    .click();
  await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]{36}$/i);
  await expect(page.getByRole("heading", { level: 1, name: "Grafana Lab" })).toBeVisible();
  await expect(page.getByText("Grafana", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  await expect(
    page.getByText(/injoignable|indisponible|Délai|TLS|DNS|jeton|Jeton/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Application error")).toHaveCount(0);
  expect(leaked).toEqual([]);
});
