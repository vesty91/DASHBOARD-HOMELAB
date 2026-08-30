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

test("creates a Docker integration without calling Docker and isolates proxy errors", async ({
  page,
}) => {
  const dockerSock: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("docker.sock") || request.url().includes("/var/run/docker.sock"))
      dockerSock.push(request.url());
  });
  await loginAdmin(page);
  await page.goto("/integrations/new");
  await expect(page.getByLabel("Type")).toContainText("Docker");
  await expect(page.getByLabel("URL de base")).toHaveAttribute(
    "placeholder",
    "http://socket-proxy:2375",
  );
  await expect(page.getByLabel("URL de base")).toHaveValue("");
  await expect(
    page.getByText("Utilisez l'URL HTTP(S) interne de votre Docker Socket Proxy."),
  ).toBeVisible();
  await page.getByLabel("Nom").fill("Docker Lab");
  await page.getByLabel("URL de base").fill("http://docker-proxy.invalid:2375");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations$/);
  await expect(page.getByRole("heading", { name: "Docker Lab" })).toBeVisible();
  await page.getByRole("link", { name: "Ouvrir" }).click();
  await expect(page.getByRole("heading", { name: "Docker Lab" })).toBeVisible();
  await expect(page.getByText("Docker", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/injoignable|indisponible|Délai|TLS|DNS/i).first()).toBeVisible();
  await expect(page.getByText("Application error")).toHaveCount(0);
  expect(dockerSock).toEqual([]);
});
