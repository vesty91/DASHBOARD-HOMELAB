import { expect, test, type Page } from "@playwright/test";
import { expectPageA11y } from "./a11y";

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

async function logout(page: Page) {
  await page.getByRole("button", { name: "Administrator" }).click();
  await page.getByRole("menuitem", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function ensureIntegration(page: Page) {
  await page.goto("/integrations");
  if (await page.getByRole("heading", { name: "status-e2e-ntfy" }).count()) return;
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("ntfy");
  await page.getByLabel("Nom").fill("status-e2e-ntfy");
  await page.getByLabel("URL de base").fill("https://ntfy.status-e2e.invalid");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
}

function utcLocalPlusMinutes(minutes: number): string {
  const date = new Date(Date.now() + minutes * 60_000);
  return date.toISOString().slice(0, 16);
}

test("status pages: create private, services, publish, public, unpublish, maintenance, a11y", async ({
  page,
  context,
}) => {
  const slug = `lab-${Date.now().toString(36)}`;
  await loginAdmin(page);
  await ensureIntegration(page);

  await page.goto("/status-pages");
  await expect(page.getByRole("heading", { name: "Status pages" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Status pages" })).toBeVisible();

  await page.getByRole("link", { name: "Nouvelle status page" }).click();
  await expect(page.getByRole("heading", { name: "Nouvelle status page" })).toBeVisible();
  await expect(page.getByTestId("status-page-private-default")).toContainText(/privée/i);

  await page.getByTestId("status-page-name").fill("E2E Status Lab");
  await page.getByTestId("status-page-slug").fill(slug);
  await page.getByTestId("status-page-description").fill("Public-safe status page");
  await page.getByTestId("status-page-create-submit").click();
  await expect(page).toHaveURL(/\/status-pages\/[0-9a-f-]{36}/i);
  await expect(page.getByText("Privée")).toBeVisible();
  await expect(page.getByText("Non publiée")).toBeVisible();

  await page.getByTestId("status-page-add-service").click();
  await page
    .getByTestId("status-service-integration-0")
    .selectOption({ label: "status-e2e-ntfy (ntfy)" });
  await page.getByTestId("status-service-name-0").fill("Public Ntfy");
  await page.getByTestId("status-page-save-services").click();
  await expect(page.getByText("Services enregistrés.")).toBeVisible();

  await page.getByTestId("status-page-publish").click();
  await expect(page.getByText("Status page publiée.")).toBeVisible();
  await expect(page.getByTestId("status-page-public-link")).toHaveAttribute(
    "href",
    `/status/${slug}`,
  );

  const starts = utcLocalPlusMinutes(10);
  const ends = utcLocalPlusMinutes(70);
  await page.getByTestId("status-maintenance-name").fill("E2E window");
  await page.getByTestId("status-maintenance-starts").fill(starts);
  await page.getByTestId("status-maintenance-ends").fill(ends);
  await page
    .getByTestId("status-maintenance-integration")
    .selectOption({ label: "Public Ntfy" });
  await page.getByTestId("status-maintenance-schedule").click();
  await expect(page.getByText("Maintenance planifiée.")).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E window" })).toBeVisible({
    timeout: 15_000,
  });

  await logout(page);

  const publicPage = await context.newPage();
  await publicPage.goto(`/status/${slug}`);
  await expect(publicPage.getByTestId("public-status-page")).toBeVisible();
  await expect(publicPage.getByRole("heading", { name: "E2E Status Lab" })).toBeVisible();
  await expect(publicPage.getByText("Public Ntfy")).toBeVisible();
  await expect(publicPage.getByText("E2E window")).toBeVisible();
  await expect(publicPage.getByText(/Statut global/i)).toBeVisible();
  await expect(publicPage.locator("body")).not.toContainText(/sourceIntegrationId/i);
  await expect(publicPage.locator("body")).not.toContainText(/ntfy\.status-e2e\.invalid/i);
  await expect(publicPage.locator("body")).not.toContainText(/https?:\/\//i);
  await expect(publicPage.getByRole("link", { name: "Publier" })).toHaveCount(0);
  await expect(publicPage.getByRole("button", { name: "Publier" })).toHaveCount(0);
  await expectPageA11y(publicPage);
  await publicPage.close();

  await loginAdmin(page);
  await page.goto("/status-pages");
  await page.getByRole("link", { name: "E2E Status Lab" }).click();
  await page.getByTestId("status-page-unpublish").click();
  await expect(page.getByText("Status page dépubliée.")).toBeVisible();

  const hidden = await context.newPage();
  const response = await hidden.goto(`/status/${slug}`);
  expect(response?.status() ?? 0).toBeGreaterThanOrEqual(400);
  await expect(hidden.getByTestId("public-status-page")).toHaveCount(0);
  await hidden.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/status-pages");
  await expect(page.getByRole("heading", { name: "Status pages" })).toBeVisible();
  await expectPageA11y(page);
});
