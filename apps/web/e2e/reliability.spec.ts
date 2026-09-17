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

async function ensureIntegration(page: Page) {
  await page.goto("/integrations");
  if (await page.getByRole("heading", { name: "reliability-e2e-ntfy" }).count()) return;
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("ntfy");
  await page.getByLabel("Nom").fill("reliability-e2e-ntfy");
  await page.getByLabel("URL de base").fill("https://ntfy.reliability-e2e.invalid");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
}

test("reliability: overview, detail, slo create, alert policy, csv export, a11y", async ({
  page,
}) => {
  await loginAdmin(page);
  await ensureIntegration(page);

  await page.goto("/reliability");
  await expect(page.getByRole("heading", { name: "Fiabilité" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fiabilité" })).toBeVisible();

  const detailLink = page.getByRole("link", { name: "Voir" }).first();
  await expect(detailLink).toBeVisible();
  await detailLink.click();
  await expect(page).toHaveURL(/\/reliability\/[0-9a-f-]{36}/i);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("reliability-daily-sparkline")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("reliability-daily-table")).toBeVisible();

  await page.getByTestId("reliability-slo-name").fill("E2E availability");
  await page.getByTestId("reliability-slo-objective").fill("99.9");
  await page.getByTestId("reliability-slo-window").selectOption("30");
  await page.getByTestId("reliability-slo-create").click();
  await expect(page.getByText("Objectif SLO créé.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("reliability-slo-table")).toContainText("E2E availability");

  await expect(page.getByTestId("reliability-burn-section")).toBeVisible();
  await expect(page.locator("[data-testid^=reliability-burn-card-]").first()).toBeVisible();

  const createPolicy = page.locator("[data-testid^=reliability-alert-create-]").first();
  await createPolicy.click();
  await expect(page.getByText("Politique d’alerte créée (désactivée).")).toBeVisible({
    timeout: 15_000,
  });

  const enabledLabel = page.locator("[data-testid^=reliability-alert-status-label-]").first();
  await expect(enabledLabel).toContainText("désactivée");

  await page.locator("[data-testid^=reliability-alert-enabled-]").first().check();
  await page.locator("[data-testid^=reliability-alert-warning-]").first().fill("2");
  await page.locator("[data-testid^=reliability-alert-critical-]").first().fill("10");
  await page.locator("[data-testid^=reliability-alert-cooldown-]").first().fill("600");
  await page.locator("[data-testid^=reliability-alert-save-]").first().click();
  await expect(page.getByText("Politique d’alerte mise à jour.")).toBeVisible({ timeout: 15_000 });
  await expect(enabledLabel).toContainText("activée");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("reliability-export-csv").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/reliability-.+\.csv$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reliability");
  await expect(page.getByRole("heading", { name: "Fiabilité" })).toBeVisible();
  await expectPageA11y(page);

  await page.getByRole("link", { name: "Voir" }).first().click();
  await expect(page.getByTestId("reliability-burn-section")).toBeVisible();
  await expectPageA11y(page);
});

test("reliability: unauthenticated access denied", async ({ browser }) => {
  const anon = await browser.newPage();
  await anon.goto("/reliability");
  await expect(anon).toHaveURL(/\/(login|setup|forbidden)/);
  await anon.close();
});
