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

test("creates a Prometheus integration without leaking the token or PromQL from the browser", async ({
  page,
}) => {
  const leaked: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("bearerToken=") ||
      url.includes("Authorization=") ||
      url.includes("query=") ||
      url.includes("/api/v1/query") ||
      url.includes("/api/v1/query_range")
    )
      leaked.push(url);
  });
  await loginAdmin(page);
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("prometheus");
  await expect(page.getByLabel("Type")).toHaveValue("prometheus");
  await expect(page.getByLabel("URL de base")).toHaveAttribute(
    "placeholder",
    "http://prometheus.example:9090",
  );
  await expect(page.getByText("Le jeton Bearer est optionnel")).toBeVisible();
  const name = `Prom Lab ${Date.now()}`;
  await page.getByLabel("Nom").fill(name);
  await page.getByLabel("URL de base").fill("http://prometheus.invalid:9090");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/, { timeout: 15_000 });
  await page.getByLabel("Jeton Bearer Prometheus (optionnel)").fill("not-a-real-bearer-token");
  await page.getByRole("button", { name: "Enregistrer le secret" }).click();
  await expect(page.getByText("Configuré")).toBeVisible();
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page
    .locator("article.ui-card")
    .filter({ has: page.getByRole("heading", { name }) })
    .getByRole("link", { name: "Ouvrir" })
    .click();
  await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]{36}$/i);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Prometheus", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  await expect(
    page.getByText(/injoignable|indisponible|Délai|TLS|DNS|Jeton Bearer|jeton Bearer/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Application error")).toHaveCount(0);
  expect(leaked).toEqual([]);
});
