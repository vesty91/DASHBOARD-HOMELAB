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

async function ensureIntegration(page: Page, name: string) {
  await page.goto("/integrations");
  if (await page.getByRole("heading", { name }).count()) return;
  await page.goto("/integrations/new");
  await page.getByLabel("Type").selectOption("ntfy");
  await page.getByLabel("Nom").fill(name);
  await page.getByLabel("URL de base").fill(`https://ntfy.${name}.invalid`);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/integrations\/.+\/edit/);
}

test("topology: create dependency, cycle rejection, impact labels, a11y, mobile", async ({
  page,
}) => {
  await loginAdmin(page);
  await ensureIntegration(page, "topology-e2e-upstream");
  await ensureIntegration(page, "topology-e2e-downstream");

  await page.goto("/topology");
  await expect(page.getByRole("heading", { name: "Topologie" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Topologie" })).toBeVisible();

  const upstreamSelect = page.getByTestId("topology-create-upstream");
  const downstreamSelect = page.getByTestId("topology-create-downstream");
  await expect(upstreamSelect).toBeVisible();

  const upstreamOption = upstreamSelect
    .locator("option")
    .filter({ hasText: "topology-e2e-upstream" });
  const downstreamOption = downstreamSelect
    .locator("option")
    .filter({ hasText: "topology-e2e-downstream" });
  const upstreamValue = await upstreamOption.getAttribute("value");
  const downstreamValue = await downstreamOption.getAttribute("value");
  expect(upstreamValue).toBeTruthy();
  expect(downstreamValue).toBeTruthy();

  await upstreamSelect.selectOption(upstreamValue!);
  await downstreamSelect.selectOption(downstreamValue!);
  await page.getByTestId("topology-create-submit").click();
  await expect(page.getByTestId("topology-info")).toContainText("Dépendance créée", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("topology-edges-table")).toContainText("topology-e2e-upstream");
  await expect(page.getByTestId("topology-edge-list")).toContainText("depends_on");

  await upstreamSelect.selectOption(downstreamValue!);
  await downstreamSelect.selectOption(upstreamValue!);
  await page.getByTestId("topology-create-submit").click();
  await expect(page.getByTestId("topology-error")).toContainText(/cycle/i, { timeout: 15_000 });

  await expect(page.getByTestId("topology-services-table")).toBeVisible();
  await expect(page.locator("[data-testid^=topology-actual-label-]").first()).toBeVisible();
  await expect(page.locator("[data-testid^=topology-impact-label-]").first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/topology");
  await expect(page.getByRole("heading", { name: "Topologie" })).toBeVisible();
  await expect(page.getByTestId("topology-edge-list")).toBeVisible();
  await expectPageA11y(page);
});

test("topology: unauthenticated access denied", async ({ browser }) => {
  const anon = await browser.newPage();
  await anon.goto("/topology");
  await expect(anon).toHaveURL(/\/(login|setup|forbidden)/);
  await anon.close();
});
