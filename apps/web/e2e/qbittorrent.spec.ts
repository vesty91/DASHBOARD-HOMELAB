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

test("creates a qBittorrent integration without leaking SID or password from the browser", async ({
  page,
}) => {
  const leaked: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("SID=") ||
      url.includes("sid=") ||
      url.includes("password=") ||
      url.includes("username=") ||
      url.includes("correct%20horse") ||
      url.includes("/api/v2/auth/login") ||
      (/qbittorrent\.invalid/i.test(url) && request.method() !== "OPTIONS")
    )
      leaked.push(`${request.method()} ${url}`);
  });
  await loginAdmin(page);
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("qbittorrent");
  await expect(page.getByLabel("URL de base")).toHaveAttribute(
    "placeholder",
    "https://qbittorrent.example:8080",
  );
  await expect(
    page.getByText("Les identifiants se configurent ensuite comme secrets serveur"),
  ).toBeVisible();
  await page.getByLabel("Nom").fill("qBittorrent Lab");
  await page.getByLabel("URL de base").fill("https://qbittorrent.invalid:8080");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
  await page.getByLabel(/Identifiant qBittorrent/).fill("Vesty");
  await page
    .locator("form")
    .filter({ has: page.getByLabel(/Identifiant qBittorrent/) })
    .getByRole("button", { name: "Enregistrer le secret" })
    .click();
  await expect(
    page
      .locator("form")
      .filter({ has: page.getByLabel(/Identifiant qBittorrent/) })
      .getByText("Configuré"),
  ).toBeVisible();
  await page.getByLabel(/Mot de passe qBittorrent/).fill(adminPassword);
  await page
    .locator("form")
    .filter({ has: page.getByLabel(/Mot de passe qBittorrent/) })
    .getByRole("button", { name: "Enregistrer le secret" })
    .click();
  await expect(
    page
      .locator("form")
      .filter({ has: page.getByLabel(/Mot de passe qBittorrent/) })
      .getByText("Configuré"),
  ).toBeVisible();
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: "qBittorrent Lab" })).toBeVisible();
  await page
    .locator("article.ui-card")
    .filter({ has: page.getByRole("heading", { name: "qBittorrent Lab" }) })
    .getByRole("link", { name: "Ouvrir" })
    .click();
  await expect(page).toHaveURL(/\/integrations\/[0-9a-f-]{36}$/i);
  await expect(page.getByRole("heading", { level: 1, name: "qBittorrent Lab" })).toBeVisible();
  await expect(page.getByText("qBittorrent", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Actions torrents" })).toBeVisible();
  await expect(page.getByLabel("Hashs")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mettre en pause" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprendre" })).toBeVisible();
  await expect(
    page.getByText(/injoignable|indisponible|Délai|TLS|DNS|identifiants|Identifiants/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Application error")).toHaveCount(0);
  expect(leaked).toEqual([]);
});
